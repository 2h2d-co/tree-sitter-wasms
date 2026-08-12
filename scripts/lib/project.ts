import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Grammar = {
  name: string;
  path: string;
  output: string;
};

export type Source = {
  id: string;
  repository: string;
  tag: string;
  commit: string;
  releasedAt: string;
  grammars: Grammar[];
};

export type SourcesLock = {
  schemaVersion: 1;
  cooldownHours: number;
  sources: Source[];
};

export type Observation = {
  repository: string;
  tag: string;
  commit: string;
  publishedAt: string;
  firstObservedAt: string;
};

export type Observations = {
  schemaVersion: 1;
  observations: Observation[];
};

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function readSourcesLock(
  path = resolve(root, "sources.lock.json"),
): Promise<SourcesLock> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(parsed) || parsed["schemaVersion"] !== 1 || !Array.isArray(parsed["sources"])) {
    throw new Error(`Invalid sources lock: ${path}`);
  }
  if (
    typeof parsed["cooldownHours"] !== "number" ||
    !Number.isInteger(parsed["cooldownHours"]) ||
    parsed["cooldownHours"] < 1
  ) {
    throw new Error(`Invalid cooldownHours in ${path}`);
  }

  const sources = parsed["sources"].map((value, index) =>
    parseSource(value, `${path} source ${index}`),
  );
  const sourceIds = sources.map((source) => source.id);
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new Error(`Duplicate source ID in ${path}`);
  }

  const outputs = sources.flatMap((source) => source.grammars.map((grammar) => grammar.output));
  if (new Set(outputs).size !== outputs.length) {
    throw new Error(`Duplicate grammar output in ${path}`);
  }

  return {
    schemaVersion: 1,
    cooldownHours: parsed["cooldownHours"],
    sources,
  };
}

export async function readObservations(
  path = resolve(root, "upstream-observations.json"),
): Promise<Observations> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (
    !isRecord(parsed) ||
    parsed["schemaVersion"] !== 1 ||
    !Array.isArray(parsed["observations"])
  ) {
    throw new Error(`Invalid observations file: ${path}`);
  }

  const observations = parsed["observations"].map((value, index) =>
    parseObservation(value, `${path} observation ${index}`),
  );
  const keys = observations.map((observation) => observationKey(observation));
  if (new Set(keys).size !== keys.length) {
    throw new Error(`Duplicate observation in ${path}`);
  }

  return { schemaVersion: 1, observations };
}

export function observationKey(value: Pick<Observation, "repository" | "tag">): string {
  return `${value.repository}@${value.tag}`;
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseSource(value: unknown, label: string): Source {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${label}`);
  }
  const id = requiredString(value, "id", label);
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`Invalid source ID in ${label}`);
  }
  const repository = parseRepository(requiredString(value, "repository", label), label);
  const tag = requiredString(value, "tag", label);
  const commit = parseCommit(requiredString(value, "commit", label), label);
  const releasedAt = parseTimestamp(requiredString(value, "releasedAt", label), label);
  if (!Array.isArray(value["grammars"]) || value["grammars"].length === 0) {
    throw new Error(`Invalid grammars in ${label}`);
  }
  const grammars = value["grammars"].map((grammar, index) =>
    parseGrammar(grammar, `${label} grammar ${index}`),
  );

  return { id, repository, tag, commit, releasedAt, grammars };
}

function parseGrammar(value: unknown, label: string): Grammar {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${label}`);
  }
  const name = requiredString(value, "name", label);
  const path = requiredString(value, "path", label);
  const output = requiredString(value, "output", label);
  if (
    !/^[a-z0-9-]+$/.test(name) ||
    (path !== "." && (!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i.test(path) || path.includes(".."))) ||
    !/^tree-sitter-[a-z0-9-]+\.wasm$/.test(output)
  ) {
    throw new Error(`Unsafe grammar path or output in ${label}`);
  }
  return { name, path, output };
}

function parseObservation(value: unknown, label: string): Observation {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return {
    repository: parseRepository(requiredString(value, "repository", label), label),
    tag: requiredString(value, "tag", label),
    commit: parseCommit(requiredString(value, "commit", label), label),
    publishedAt: parseTimestamp(requiredString(value, "publishedAt", label), label),
    firstObservedAt: parseTimestamp(requiredString(value, "firstObservedAt", label), label),
  };
}

function parseRepository(value: string, label: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error(`Invalid repository in ${label}`);
  }
  return value;
}

function parseCommit(value: string, label: string): string {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`Invalid commit in ${label}`);
  }
  return value;
}

function parseTimestamp(value: string, label: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(`Invalid timestamp in ${label}`);
  }
  return value;
}

function requiredString(value: Record<string, unknown>, key: string, label: string): string {
  const result = value[key];
  if (typeof result !== "string" || result.length === 0) {
    throw new Error(`Missing ${key} in ${label}`);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
