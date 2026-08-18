import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isJsonObject, isString, parseJsonObject, root, type JsonObject } from "./lib/project.ts";

type PackFile = {
  path: string;
};

type PackResult = {
  filename: string;
  files: PackFile[];
  name: string;
  version: string;
};

const [mode, destinationArgument] = process.argv.slice(2);
if ((mode !== "--dry-run" && mode !== "--pack") || (mode === "--pack" && !destinationArgument)) {
  throw new Error("Usage: node scripts/package-policy.ts --dry-run | --pack <directory>");
}

const manifest = parseJsonObject(
  await readFile(resolve(root, "package.json"), "utf8"),
  "package.json",
);
const expectedFiles = (await readFile(resolve(root, ".github", "npm-package-files"), "utf8"))
  .split(/\r?\n/)
  .filter(Boolean)
  .sort();
validateExpectedFiles(expectedFiles);
validateManifestPolicy(manifest);

const args = ["pack", "--json", "--ignore-scripts", "--allow-directory=all"];
if (mode === "--dry-run") {
  args.push("--dry-run");
} else {
  if (!destinationArgument) {
    throw new Error("Package destination is required");
  }
  const destination = resolve(destinationArgument);
  await mkdir(destination, { recursive: true });
  args.push("--pack-destination", destination);
}
const result = parsePackResult(npmOutput(args));
if (result.name !== manifest["name"] || result.version !== manifest["version"]) {
  throw new Error(`Unexpected package identity ${result.name}@${result.version}`);
}
const actualFiles = result.files.map((file) => file.path).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(
    `Unexpected npm package files:\nexpected ${expectedFiles.join(", ")}\nactual ${actualFiles.join(", ")}`,
  );
}

if (mode === "--dry-run") {
  console.log(`Validated ${result.name}@${result.version} with ${actualFiles.length} files.`);
} else {
  if (!destinationArgument) {
    throw new Error("Package destination is required");
  }
  const archive = resolve(destinationArgument, result.filename);
  const digest = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  console.log(JSON.stringify({ archive, digest, name: result.name, version: result.version }));
}

function validateExpectedFiles(files: string[]): void {
  if (
    files.length === 0 ||
    files.some(
      (file) =>
        file.trim() !== file || file.startsWith("/") || file.includes("..") || file.includes("\\"),
    ) ||
    new Set(files).size !== files.length
  ) {
    throw new Error(".github/npm-package-files contains invalid package paths");
  }
}

function validateManifestPolicy(value: JsonObject): void {
  if (value["name"] !== "@2h2d/tree-sitter-wasms" || !isString(value["version"])) {
    throw new Error("Unexpected package name or version");
  }
  const scripts = value["scripts"];
  const forbiddenNames = [
    "preinstall",
    "install",
    "postinstall",
    "prepack",
    "prepare",
    "postpack",
    "prepublish",
    "prepublishOnly",
    "publish",
    "postpublish",
  ];
  const forbidden = isJsonObject(scripts)
    ? forbiddenNames.filter((name) => isString(scripts[name]))
    : [];
  if (forbidden.length > 0) {
    throw new Error(`Install lifecycle scripts are forbidden: ${forbidden.join(", ")}`);
  }
  const bundled = value["bundledDependencies"] ?? value["bundleDependencies"];
  if (bundled === true || (Array.isArray(bundled) && bundled.length > 0)) {
    throw new Error("Bundled dependencies are forbidden");
  }
  if ("dependencies" in value || "optionalDependencies" in value) {
    throw new Error("The WASM package must not have consumer dependencies");
  }
}

function parsePackResult(output: string): PackResult {
  const parsed: unknown = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.length !== 1 || !isPackResult(parsed[0])) {
    throw new Error("npm pack did not report exactly one package");
  }
  return parsed[0];
}

function npmOutput(args: string[]): string {
  const npmExecPath = process.env["npm_execpath"];
  if (!npmExecPath) {
    throw new Error("Run package-policy.ts through npm so npm_execpath is available");
  }
  const result = spawnSync(npmExecPath, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function isPackFile(value: unknown): value is PackFile {
  return isJsonObject(value) && isString(value["path"]);
}

function isPackResult(value: unknown): value is PackResult {
  return (
    isJsonObject(value) &&
    isString(value["filename"]) &&
    isString(value["name"]) &&
    isString(value["version"]) &&
    Array.isArray(value["files"]) &&
    value["files"].every(isPackFile)
  );
}
