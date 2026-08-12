import assert from "node:assert/strict";
import test from "node:test";
import { applyDiscovery, type Release } from "../scripts/lib/discovery.ts";
import type { Observations, SourcesLock } from "../scripts/lib/project.ts";

const repository = "tree-sitter/tree-sitter-example";
const commit1 = "1".repeat(40);
const commit2 = "2".repeat(40);
const commit3 = "3".repeat(40);
const lock: SourcesLock = {
  schemaVersion: 1,
  cooldownHours: 72,
  sources: [
    {
      id: "example",
      repository,
      tag: "v1.0.0",
      commit: commit1,
      releasedAt: "2026-01-01T00:00:00Z",
      grammars: [{ name: "example", path: ".", output: "tree-sitter-example.wasm" }],
    },
  ],
};
const observations: Observations = {
  schemaVersion: 1,
  observations: [
    {
      repository,
      tag: "v1.0.0",
      commit: commit1,
      publishedAt: "2026-01-01T00:00:00Z",
      firstObservedAt: "2026-01-01T00:00:00Z",
    },
  ],
};

await test("observes a release before selecting it", () => {
  const result = applyDiscovery(
    lock,
    observations,
    [
      release("v1.0.0", commit1, "2026-01-01T00:00:00Z"),
      release("v1.1.0", commit2, "2026-01-10T00:00:00Z"),
    ],
    new Date("2026-01-11T00:00:00Z"),
  );
  assert.equal(result.sourcesChanged, false);
  assert.equal(result.stateChanged, true);
  assert.equal(result.observations.observations.at(-1)?.firstObservedAt, "2026-01-11T00:00:00Z");
});

await test("selects the newest eligible release without waiting for a newer release", () => {
  const firstRun = applyDiscovery(
    lock,
    observations,
    [
      release("v1.0.0", commit1, "2026-01-01T00:00:00Z"),
      release("v1.1.0", commit2, "2026-01-10T00:00:00Z"),
      release("v1.2.0", commit3, "2026-01-13T12:00:00Z"),
    ],
    new Date("2026-01-14T00:00:00Z"),
  );
  const adjustedObservations: Observations = {
    ...firstRun.observations,
    observations: firstRun.observations.observations.map((observation) =>
      observation.tag === "v1.1.0"
        ? { ...observation, firstObservedAt: "2026-01-10T12:00:00Z" }
        : observation,
    ),
  };
  const result = applyDiscovery(
    lock,
    adjustedObservations,
    [
      release("v1.0.0", commit1, "2026-01-01T00:00:00Z"),
      release("v1.1.0", commit2, "2026-01-10T00:00:00Z"),
      release("v1.2.0", commit3, "2026-01-13T12:00:00Z"),
    ],
    new Date("2026-01-14T00:00:00Z"),
  );
  assert.equal(result.sourcesChanged, true);
  assert.equal(result.lock.sources[0]?.tag, "v1.1.0");
});

await test("resets the cooldown when a tag is retargeted", () => {
  const existing: Observations = {
    schemaVersion: 1,
    observations: [
      observations.observations[0]!,
      {
        repository,
        tag: "v1.1.0",
        commit: commit2,
        publishedAt: "2026-01-10T00:00:00Z",
        firstObservedAt: "2026-01-10T00:00:00Z",
      },
    ],
  };
  const result = applyDiscovery(
    lock,
    existing,
    [
      release("v1.0.0", commit1, "2026-01-01T00:00:00Z"),
      release("v1.1.0", commit3, "2026-01-10T00:00:00Z"),
    ],
    new Date("2026-01-20T00:00:00Z"),
  );
  assert.equal(result.sourcesChanged, false);
  const retargeted = result.observations.observations.find(
    (observation) => observation.tag === "v1.1.0",
  );
  assert.equal(retargeted?.commit, commit3);
  assert.equal(retargeted?.firstObservedAt, "2026-01-20T00:00:00Z");
});

await test("applies a same-tag retarget only after its new commit cools down", () => {
  const retargetedObservations: Observations = {
    schemaVersion: 1,
    observations: [
      {
        repository,
        tag: "v1.0.0",
        commit: commit2,
        publishedAt: "2026-01-01T00:00:00Z",
        firstObservedAt: "2026-01-10T00:00:00Z",
      },
    ],
  };
  const result = applyDiscovery(
    lock,
    retargetedObservations,
    [release("v1.0.0", commit2, "2026-01-01T00:00:00Z")],
    new Date("2026-01-14T00:00:00Z"),
  );
  assert.equal(result.sourcesChanged, true);
  assert.equal(result.lock.sources[0]?.commit, commit2);
});

function release(tag: string, commit: string, publishedAt: string): Release {
  return { repository, tag, commit, publishedAt };
}
