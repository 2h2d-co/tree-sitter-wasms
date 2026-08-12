import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { LANGUAGE_VERSION, Language, MIN_COMPATIBLE_VERSION, Parser } from "web-tree-sitter";
import { grammarFiles, wasmURL } from "../src/index.ts";

type GrammarManifest = {
  name: keyof typeof samples;
  file: string;
  sha256: string;
  bytes: number;
};

type Manifest = {
  grammars: GrammarManifest[];
};

const root = resolve(import.meta.dirname, "..");
const samples = {
  go: 'package main\n\nfunc main() { println("hello") }\n',
  java: "class Main { public static void main(String[] args) {} }\n",
  javascript: "const greeting = (name) => `Hello, ${name}`;\n",
  python: 'def greeting(name: str) -> str:\n    return f"Hello, {name}"\n',
  scala: 'object Main:\n  def main(args: Array[String]): Unit = println("hello")\n',
  tsx: "const Greeting = ({ name }: { name: string }) => <div>Hello, {name}</div>;\n",
  typescript: "export function greeting(name: string): string { return `Hello, ${name}`; }\n",
} as const;

await Parser.init();

await test("exports stable URLs, including the JSX alias", () => {
  assert.equal(grammarFiles.jsx, grammarFiles.javascript);
  assert.equal(wasmURL("python").protocol, "file:");
  assert.match(wasmURL("python").pathname, /\/wasm\/tree-sitter-python\.wasm$/);
});

await test("manifest digests match loadable grammar WASMs", async (context) => {
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8")) as Manifest;
  assert.deepEqual(
    manifest.grammars.map((grammar) => grammar.name),
    Object.keys(samples).sort(),
  );

  for (const grammar of manifest.grammars) {
    await context.test(grammar.name, async () => {
      const path = resolve(root, "wasm", grammar.file);
      const contents = await readFile(path);
      assert.equal(contents.length, grammar.bytes);
      assert.equal(createHash("sha256").update(contents).digest("hex"), grammar.sha256);

      const language = await Language.load(contents);
      assert.ok(language.abiVersion >= MIN_COMPATIBLE_VERSION);
      assert.ok(language.abiVersion <= LANGUAGE_VERSION);

      const parser = new Parser();
      parser.setLanguage(language);
      const tree = parser.parse(samples[grammar.name]);
      assert.ok(tree);
      assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
      tree.delete();
      parser.delete();
    });
  }
});
