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

export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonObject | JsonPrimitive | JsonValue[];

export type JsonObject = {
  [key: string]: JsonValue;
};

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function readSourcesLock(
  path = resolve(root, "sources.lock.json"),
): Promise<SourcesLock> {
  return parseSourcesLock(await readFile(path, "utf8"), path);
}

export function parseSourcesLock(value: string, label: string): SourcesLock {
  const parsed = parseJsonObject(value, label);
  if (parsed["schemaVersion"] !== 1 || !Array.isArray(parsed["sources"])) {
    throw new Error(`Invalid sources lock: ${label}`);
  }
  if (
    !isNumber(parsed["cooldownHours"]) ||
    !Number.isInteger(parsed["cooldownHours"]) ||
    parsed["cooldownHours"] < 1
  ) {
    throw new Error(`Invalid cooldownHours in ${label}`);
  }

  const sources = parsed["sources"].map((value, index) =>
    parseSource(value, `${label} source ${index}`),
  );
  const sourceIds = sources.map((source) => source.id);
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new Error(`Duplicate source ID in ${label}`);
  }

  const outputs = sources.flatMap((source) => source.grammars.map((grammar) => grammar.output));
  if (new Set(outputs).size !== outputs.length) {
    throw new Error(`Duplicate grammar output in ${label}`);
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
  const parsed = parseJsonObject(await readFile(path, "utf8"), path);
  if (parsed["schemaVersion"] !== 1 || !Array.isArray(parsed["observations"])) {
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
  if (!isJsonObject(value)) {
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
  if (!isJsonObject(value)) {
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
  if (!isJsonObject(value)) {
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

function requiredString(value: JsonObject, key: string, label: string): string {
  const result = value[key];
  if (!isString(result) || result.length === 0) {
    throw new Error(`Missing ${key} in ${label}`);
  }
  return result;
}

export function parseJsonObject(value: string, label: string): JsonObject {
  const parsed: unknown = JSON.parse(value);
  if (!isJsonObject(parsed)) {
    throw new Error(`Expected a JSON object: ${label}`);
  }
  return parsed;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || isBoolean(value) || isNumber(value) || isString(value)) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === "object" && Object.values(value).every(isJsonValue);
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && isJsonValue(value) && value !== null && !Array.isArray(value);
}
