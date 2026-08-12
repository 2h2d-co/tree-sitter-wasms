import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { root } from "./lib/project.ts";

const archiveArgument = process.argv[2];
if (!archiveArgument || process.argv.length !== 3) {
  throw new Error("Usage: npm run test:package -- <package.tgz>");
}
const archive = await realpath(resolve(archiveArgument));
if (!archive.endsWith(".tgz") || !(await stat(archive)).isFile()) {
  throw new Error(`Expected a package archive: ${archive}`);
}
const npmExecPath = process.env["npm_execpath"];
if (!npmExecPath) {
  throw new Error("Run test:package through npm so npm_execpath is available");
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "tree-sitter-wasms-consumer-"));
try {
  const consumer = resolve(temporaryRoot, "consumer");
  await mkdir(consumer);
  await writeFile(resolve(consumer, ".npmrc"), await readFile(resolve(root, ".npmrc")));
  await writeFile(
    resolve(consumer, "package.json"),
    `${JSON.stringify(
      {
        name: "tree-sitter-wasms-consumer-test",
        private: true,
        type: "module",
        dependencies: {
          "@2h2d/tree-sitter-wasms": pathToFileURL(archive).href,
          "web-tree-sitter": "0.26.11",
        },
      },
      null,
      2,
    )}\n`,
  );
  npm(["install", "--ignore-scripts", "--no-package-lock"], consumer);
  await writeFile(resolve(consumer, "smoke.mjs"), smokeTest());
  run(process.execPath, ["smoke.mjs"], consumer);
  console.log(`Consumer integration test passed for ${archive}`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function npm(args: string[], cwd: string): void {
  run(npmExecPath!, args, cwd);
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
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

function smokeTest(): string {
  return String.raw`
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Language, Parser } from "web-tree-sitter";
import {
  grammarFiles,
  wasmURL,
} from "@2h2d/tree-sitter-wasms";
import manifest from "@2h2d/tree-sitter-wasms/manifest.json" with { type: "json" };

const samples = {
  go: "package main\n\nfunc main() { println(\"hello\") }\n",
  java: "class Main { public static void main(String[] args) {} }\n",
  javascript: "const greeting = (name) => \"Hello, \" + name;\n",
  python: "def greeting(name: str) -> str:\n    return f\"Hello, {name}\"\n",
  scala: "object Main:\n  def main(args: Array[String]): Unit = println(\"hello\")\n",
  tsx: "const Greeting = ({ name }: { name: string }) => <div>Hello, {name}</div>;\n",
  typescript: "export function greeting(name: string): string { return \"Hello, \" + name; }\n",
};

assert.equal(grammarFiles.jsx, grammarFiles.javascript);
assert.equal(Object.hasOwn(grammarFiles, "python"), true);
assert.equal(manifest.package.name, "@2h2d/tree-sitter-wasms");
assert.equal(manifest.grammars.length, 7);

await Parser.init();
for (const grammar of manifest.grammars) {
  const aliases = Object.entries(grammarFiles)
    .filter(([, file]) => file === grammar.file)
    .map(([name]) => name);
  assert.ok(aliases.length > 0, "manifest grammar must have an exported alias");
  const path = fileURLToPath(wasmURL(aliases[0]));
  const contents = await readFile(path);
  assert.equal(contents.length, grammar.bytes);
  assert.equal(createHash("sha256").update(contents).digest("hex"), grammar.sha256);

  const language = await Language.load(contents);
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(samples[grammar.name]);
  assert.ok(tree);
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  tree.delete();
  parser.delete();
}

console.log("Installed package exports and all grammar WASMs passed.");
`;
}
