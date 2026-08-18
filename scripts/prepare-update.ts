import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildWasms } from "./build-wasms.ts";
import {
  isString,
  parseJsonObject,
  parseSourcesLock,
  readSourcesLock,
  root,
  type SourcesLock,
} from "./lib/project.ts";

if (process.argv.length !== 2) {
  throw new Error("prepare-update.ts does not accept arguments");
}
if (!npmExecPath()) {
  throw new Error("Run prepare:update through npm so npm_execpath is available");
}

const oldLock = parseSourcesLock(
  gitOutput(["show", "HEAD:sources.lock.json"]),
  "HEAD:sources.lock.json",
);
const newLock = await readSourcesLock();
const changes = describeChanges(oldLock, newLock);
if (changes.length === 0) {
  throw new Error("sources.lock.json contains no selected upstream change");
}

npm(["version", "patch", "--no-git-tag-version", "--ignore-scripts"]);
const packageJson = parseJsonObject(
  await readFile(resolve(root, "package.json"), "utf8"),
  "package.json",
);
const version = packageJson["version"];
if (!isString(version)) {
  throw new Error("package.json has an invalid version");
}
await buildWasms();
await updateChangelog(version, changes);
console.log(`Prepared @2h2d/tree-sitter-wasms ${version}:`);
for (const change of changes) {
  console.log(`- ${change}`);
}

function describeChanges(oldLock: SourcesLock, newLock: SourcesLock): string[] {
  const oldById = new Map(oldLock.sources.map((source) => [source.id, source]));
  return newLock.sources.flatMap((source) => {
    const previous = oldById.get(source.id);
    if (!previous || (previous.tag === source.tag && previous.commit === source.commit)) {
      return [];
    }
    return [
      `${source.id}: ${previous.tag} (${previous.commit.slice(0, 12)}) to ${source.tag} (${source.commit.slice(0, 12)})`,
    ];
  });
}

async function updateChangelog(version: string, changes: string[]): Promise<void> {
  const path = resolve(root, "CHANGELOG.md");
  const changelog = await readFile(path, "utf8");
  const marker = "## [Unreleased]\n";
  if (!changelog.includes(marker)) {
    throw new Error("CHANGELOG.md is missing the Unreleased section");
  }
  const date = new Date().toISOString().slice(0, 10);
  const section = [
    "",
    `## [${version}] - ${date}`,
    "",
    "### Changed",
    "",
    ...changes.map((change) => `- Update ${change}.`),
    "",
  ].join("\n");
  await writeFile(path, changelog.replace(marker, `${marker}${section}`));
}

function npm(args: string[]): void {
  const executable = npmExecPath();
  if (!executable) {
    throw new Error("Run prepare:update through npm so npm_execpath is available");
  }
  run(executable, args);
}

function npmExecPath(): string | undefined {
  return process.env["npm_execpath"];
}

function gitOutput(args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status ?? "no status"}`);
  }
}
