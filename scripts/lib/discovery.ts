import type { Observation, Observations, Source, SourcesLock } from "./project.ts";
import { observationKey } from "./project.ts";

export type Release = {
  repository: string;
  tag: string;
  commit: string;
  publishedAt: string;
};

export type DiscoveryResult = {
  lock: SourcesLock;
  observations: Observations;
  sourcesChanged: boolean;
  stateChanged: boolean;
};

export function applyDiscovery(
  currentLock: SourcesLock,
  currentObservations: Observations,
  releases: Release[],
  now: Date,
): DiscoveryResult {
  if (!Number.isFinite(now.valueOf())) {
    throw new Error("Discovery time is invalid");
  }
  const nowIso = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const cooldownMilliseconds = currentLock.cooldownHours * 60 * 60 * 1000;
  const releasesByRepository = Map.groupBy(releases, (release) => release.repository);
  const existingByKey = new Map(
    currentObservations.observations.map((observation) => [
      observationKey(observation),
      observation,
    ]),
  );
  const nextSources: Source[] = [];
  const nextObservations: Observation[] = [];

  for (const source of currentLock.sources) {
    const repositoryReleases = releasesByRepository.get(source.repository) ?? [];
    const relevant = repositoryReleases.filter(
      (release) =>
        release.tag === source.tag ||
        Date.parse(release.publishedAt) > Date.parse(source.releasedAt),
    );
    if (!relevant.some((release) => release.tag === source.tag)) {
      relevant.push({
        repository: source.repository,
        tag: source.tag,
        commit: source.commit,
        publishedAt: source.releasedAt,
      });
    }

    for (const release of relevant) {
      const previous = existingByKey.get(observationKey(release));
      nextObservations.push({
        repository: release.repository,
        tag: release.tag,
        commit: release.commit,
        publishedAt: release.publishedAt,
        firstObservedAt:
          previous?.commit === release.commit && previous.publishedAt === release.publishedAt
            ? previous.firstObservedAt
            : nowIso,
      });
    }

    const eligible = relevant
      .filter(
        (release) =>
          Date.parse(release.publishedAt) > Date.parse(source.releasedAt) ||
          (release.tag === source.tag && release.commit !== source.commit),
      )
      .filter((release) => {
        const observation = nextObservations.find(
          (value) =>
            value.repository === release.repository &&
            value.tag === release.tag &&
            value.commit === release.commit,
        );
        if (!observation) {
          return false;
        }
        return (
          now.valueOf() - Date.parse(release.publishedAt) >= cooldownMilliseconds &&
          now.valueOf() - Date.parse(observation.firstObservedAt) >= cooldownMilliseconds
        );
      })
      .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));

    const selected = eligible[0];
    nextSources.push(
      selected
        ? {
            ...source,
            tag: selected.tag,
            commit: selected.commit,
            releasedAt: selected.publishedAt,
          }
        : source,
    );
  }

  const selectedKeys = new Set(
    nextSources.map((source) => observationKey({ repository: source.repository, tag: source.tag })),
  );
  const selectedReleaseTimes = new Map(
    nextSources.map((source) => [source.repository, Date.parse(source.releasedAt)]),
  );
  const prunedObservations = nextObservations
    .filter((observation) => {
      const selectedTime = selectedReleaseTimes.get(observation.repository);
      return (
        selectedKeys.has(observationKey(observation)) ||
        (selectedTime !== undefined && Date.parse(observation.publishedAt) > selectedTime)
      );
    })
    .sort(
      (left, right) =>
        left.repository.localeCompare(right.repository) ||
        Date.parse(left.publishedAt) - Date.parse(right.publishedAt) ||
        left.tag.localeCompare(right.tag),
    );

  const lock: SourcesLock = { ...currentLock, sources: nextSources };
  const observations: Observations = {
    schemaVersion: 1,
    observations: prunedObservations,
  };
  const sourcesChanged = JSON.stringify(lock) !== JSON.stringify(currentLock);
  const stateChanged = JSON.stringify(observations) !== JSON.stringify(currentObservations);
  return { lock, observations, sourcesChanged, stateChanged };
}
