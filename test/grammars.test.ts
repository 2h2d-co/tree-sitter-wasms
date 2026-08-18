import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { LANGUAGE_VERSION, Language, MIN_COMPATIBLE_VERSION, Parser } from "web-tree-sitter";
import { grammarSamples } from "../scripts/lib/grammar-samples.ts";
import { isJsonObject, isNumber, isString } from "../scripts/lib/project.ts";
import { grammarFiles, wasmURL } from "../src/index.ts";

type GrammarManifest = {
  name: keyof typeof grammarSamples;
  file: string;
  sha256: string;
  bytes: number;
};

type Manifest = {
  grammars: GrammarManifest[];
};

const root = resolve(import.meta.dirname, "..");

function parseManifest(value: string): Manifest {
  const parsed: unknown = JSON.parse(value);
  if (
    !isJsonObject(parsed) ||
    !Array.isArray(parsed["grammars"]) ||
    !parsed["grammars"].every(isGrammarManifest)
  ) {
    throw new Error("manifest.json is invalid");
  }
  return { grammars: parsed["grammars"] };
}

function isGrammarManifest(value: unknown): value is GrammarManifest {
  return (
    isJsonObject(value) &&
    isGrammarName(value["name"]) &&
    isString(value["file"]) &&
    isString(value["sha256"]) &&
    isNumber(value["bytes"])
  );
}

function isGrammarName(value: unknown): value is keyof typeof grammarSamples {
  return isString(value) && Object.hasOwn(grammarSamples, value);
}

await Parser.init();

await test("exports stable URLs, including the JSX alias", () => {
  assert.equal(grammarFiles.jsx, grammarFiles.javascript);
  assert.equal(wasmURL("python").protocol, "file:");
  assert.match(wasmURL("python").pathname, /\/wasm\/tree-sitter-python\.wasm$/);
});

await test("manifest digests match loadable grammar WASMs", async (context) => {
  const manifest = parseManifest(await readFile(resolve(root, "manifest.json"), "utf8"));
  assert.deepEqual(
    manifest.grammars.map((grammar) => grammar.name),
    Object.keys(grammarSamples).sort(),
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
      const tree = parser.parse(grammarSamples[grammar.name]);
      assert.ok(tree);
      assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
      tree.delete();
      parser.delete();
    });
  }
});
