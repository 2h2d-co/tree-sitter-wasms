import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { buildWasms } from "./build-wasms.ts";
import { root } from "./lib/project.ts";

if (process.argv.length !== 2) {
  throw new Error("verify-generated.ts does not accept arguments");
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "tree-sitter-wasms-verify-"));
try {
  await buildWasms(temporaryRoot);
  const expected = await generatedFiles(temporaryRoot);
  const actual = await generatedFiles(root);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Generated file set differs:\nexpected ${expected.join(", ")}\nactual ${actual.join(", ")}`,
    );
  }
  for (const path of expected) {
    const expectedDigest = await sha256(resolve(temporaryRoot, path));
    const actualDigest = await sha256(resolve(root, path));
    if (actualDigest !== expectedDigest) {
      throw new Error(`${path} differs: expected ${expectedDigest}, actual ${actualDigest}`);
    }
  }
  console.log(`Verified ${expected.length} reproducible generated files.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function generatedFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const topLevel of ["LICENSES", "manifest.json", "wasm"]) {
    const path = resolve(directory, topLevel);
    const pathStat = await stat(path);
    if (pathStat.isFile()) {
      files.push(topLevel);
      continue;
    }
    if (!pathStat.isDirectory()) {
      throw new Error(`Generated path has unsupported type: ${path}`);
    }
    await collect(path, directory, files);
  }
  return files.sort();
}

async function collect(directory: string, rootDirectory: string, files: string[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(path, rootDirectory, files);
    } else if (entry.isFile()) {
      files.push(relative(rootDirectory, path));
    } else {
      throw new Error(`Generated output may not contain symlinks: ${path}`);
    }
  }
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}
