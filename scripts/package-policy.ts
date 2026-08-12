import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { root } from "./lib/project.ts";

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

const manifest = parseRecord(await readFile(resolve(root, "package.json"), "utf8"));
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
  const destination = resolve(destinationArgument!);
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
  const archive = resolve(destinationArgument!, result.filename);
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

function validateManifestPolicy(value: Record<string, unknown>): void {
  if (value["name"] !== "@2h2d/tree-sitter-wasms" || typeof value["version"] !== "string") {
    throw new Error("Unexpected package name or version");
  }
  const scripts = isRecord(value["scripts"]) ? value["scripts"] : {};
  const forbidden = [
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
  ].filter((name) => typeof scripts[name] === "string");
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
  if (!Array.isArray(parsed) || parsed.length !== 1 || !isRecord(parsed[0])) {
    throw new Error("npm pack did not report exactly one package");
  }
  const value = parsed[0];
  if (
    typeof value["filename"] !== "string" ||
    typeof value["name"] !== "string" ||
    typeof value["version"] !== "string" ||
    !Array.isArray(value["files"])
  ) {
    throw new Error("npm pack returned invalid metadata");
  }
  const files = value["files"].map((file) => {
    if (!isRecord(file) || typeof file["path"] !== "string") {
      throw new Error("npm pack returned an invalid file entry");
    }
    return { path: file["path"] };
  });
  return {
    filename: value["filename"],
    files,
    name: value["name"],
    version: value["version"],
  };
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

function parseRecord(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new Error("Expected a JSON object");
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
