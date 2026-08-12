import { appendFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyDiscovery, type Release } from "./lib/discovery.ts";
import {
  canonicalJson,
  readObservations,
  readSourcesLock,
  root,
  type Source,
} from "./lib/project.ts";

type GitHubRelease = {
  tag_name: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
};

type GitObject = {
  object: {
    type: string;
    sha: string;
  };
};

if (process.argv.length !== 2) {
  throw new Error("discover-upstreams.ts does not accept arguments");
}

const lock = await readSourcesLock();
const observations = await readObservations();
const now = process.env["DISCOVERY_NOW"] ? new Date(process.env["DISCOVERY_NOW"]) : new Date();
const token = process.env["GITHUB_TOKEN"];
const releases = (
  await Promise.all(lock.sources.map((source) => discoverReleases(source, token)))
).flat();
const result = applyDiscovery(lock, observations, releases, now);

if (result.sourcesChanged) {
  await writeFile(resolve(root, "sources.lock.json"), canonicalJson(result.lock));
}
if (result.stateChanged) {
  await writeFile(resolve(root, "upstream-observations.json"), canonicalJson(result.observations));
}

await writeOutput("sources_changed", String(result.sourcesChanged));
await writeOutput("state_changed", String(result.stateChanged));
console.log(
  JSON.stringify(
    {
      sourcesChanged: result.sourcesChanged,
      stateChanged: result.stateChanged,
      observedReleases: result.observations.observations.length,
    },
    null,
    2,
  ),
);

async function discoverReleases(source: Source, token: string | undefined): Promise<Release[]> {
  const releases = await listReleases(source.repository, token);
  const relevant = releases.filter(
    (release) =>
      !release.draft &&
      !release.prerelease &&
      (release.tag_name === source.tag ||
        Date.parse(release.published_at) > Date.parse(source.releasedAt)),
  );

  return Promise.all(
    relevant.map(async (release) => ({
      repository: source.repository,
      tag: release.tag_name,
      commit: await resolveTag(source.repository, release.tag_name, token),
      publishedAt: normalizeTimestamp(release.published_at),
    })),
  );
}

async function listReleases(
  repository: string,
  token: string | undefined,
): Promise<GitHubRelease[]> {
  const releases: GitHubRelease[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const pageReleases = await githubJson<GitHubRelease[]>(
      `/repos/${repository}/releases?per_page=100&page=${page}`,
      token,
    );
    releases.push(...pageReleases);
    if (pageReleases.length < 100) {
      return releases;
    }
  }
  throw new Error(`${repository} has more than 2,000 releases; refusing incomplete discovery`);
}

async function resolveTag(
  repository: string,
  tag: string,
  token: string | undefined,
): Promise<string> {
  let object = (
    await githubJson<GitObject>(
      `/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`,
      token,
    )
  ).object;
  for (let depth = 0; object.type === "tag" && depth < 5; depth += 1) {
    object = (await githubJson<GitObject>(`/repos/${repository}/git/tags/${object.sha}`, token))
      .object;
  }
  if (object.type !== "commit" || !/^[0-9a-f]{40}$/.test(object.sha)) {
    throw new Error(`${repository} tag ${tag} did not resolve to a commit`);
  }
  return object.sha;
}

async function githubJson<T>(path: string, token: string | undefined): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "@2h2d/tree-sitter-wasms",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

function normalizeTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.valueOf())) {
    throw new Error(`Invalid GitHub release timestamp: ${value}`);
  }
  return timestamp.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function writeOutput(name: string, value: string): Promise<void> {
  const outputPath = process.env["GITHUB_OUTPUT"];
  if (outputPath) {
    await appendFile(outputPath, `${name}=${value}\n`);
  }
}
