import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, isString, parseJsonObject, readSourcesLock, root } from "./lib/project.ts";

type PackageJson = {
  name: string;
  version: string;
};

type ErrorWithCode = {
  code: string;
};

type GrammarManifest = {
  name: string;
  file: string;
  sha256: string;
  bytes: number;
  source: {
    repository: string;
    tag: string;
    commit: string;
    releasedAt: string;
  };
};

export async function buildWasms(destination = root): Promise<void> {
  const sourcesLock = await readSourcesLock();
  const packageJson = await readPackageJson();
  const temporaryRoot = await mkdtemp(join(tmpdir(), "tree-sitter-wasms-build-"));
  const staged = join(temporaryRoot, "staged");
  const stagedWasms = join(staged, "wasm");
  const stagedLicenses = join(staged, "LICENSES");
  await mkdir(stagedWasms, { recursive: true });
  await mkdir(stagedLicenses, { recursive: true });

  const wasiSdkRoot = await toolRoot("wasm32-wasi-clang");
  const binaryenRoot = await toolRoot("wasm-opt");
  const grammarManifest: GrammarManifest[] = [];

  try {
    for (const source of sourcesLock.sources) {
      const checkout = join(temporaryRoot, `source-${source.id}`);
      run("git", ["init", "--quiet", checkout]);
      run("git", [
        "-C",
        checkout,
        "remote",
        "add",
        "origin",
        `https://github.com/${source.repository}.git`,
      ]);
      run("git", ["-C", checkout, "fetch", "--quiet", "--depth=1", "origin", source.commit]);
      run("git", ["-C", checkout, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);

      const checkedOutCommit = output("git", ["-C", checkout, "rev-parse", "HEAD"]);
      if (checkedOutCommit !== source.commit) {
        throw new Error(
          `${source.repository} resolved to ${checkedOutCommit}, expected ${source.commit}`,
        );
      }

      const license = resolve(checkout, "LICENSE");
      await assertRegularFileInside(license, checkout);
      const licenseText = await readFile(license, "utf8");
      await writeFile(resolve(stagedLicenses, `${source.id}.txt`), `${licenseText.trimEnd()}\n`);

      for (const grammar of source.grammars) {
        const grammarPath = resolve(checkout, grammar.path);
        await assertDirectoryInside(grammarPath, checkout);
        const wasmPath = resolve(stagedWasms, grammar.output);
        run("tree-sitter", ["build", "--wasm", "--output", wasmPath, grammarPath], {
          TREE_SITTER_WASI_SDK_PATH: wasiSdkRoot,
          TREE_SITTER_BINARYEN_PATH: binaryenRoot,
        });
        await chmod(wasmPath, 0o644);
        const contents = await readFile(wasmPath);
        if (contents.length < 8 || contents.subarray(0, 4).toString("hex") !== "0061736d") {
          throw new Error(`${grammar.output} is not a WebAssembly module`);
        }
        grammarManifest.push({
          name: grammar.name,
          file: grammar.output,
          sha256: createHash("sha256").update(contents).digest("hex"),
          bytes: contents.length,
          source: {
            repository: source.repository,
            tag: source.tag,
            commit: source.commit,
            releasedAt: source.releasedAt,
          },
        });
      }
    }

    grammarManifest.sort((left, right) => left.name.localeCompare(right.name));
    const manifest = {
      schemaVersion: 1,
      package: {
        name: packageJson.name,
        version: packageJson.version,
      },
      toolchain: {
        treeSitter: output("tree-sitter", ["--version"]),
        wasiSdk: (await readFile(resolve(wasiSdkRoot, "VERSION"), "utf8")).trim(),
        binaryen: output("wasm-opt", ["--version"]),
      },
      grammars: grammarManifest,
    };
    await writeFile(resolve(staged, "manifest.json"), canonicalJson(manifest));

    await replaceGeneratedDirectory(stagedWasms, resolve(destination, "wasm"));
    await replaceGeneratedDirectory(stagedLicenses, resolve(destination, "LICENSES"));
    await mkdir(destination, { recursive: true });
    await rename(resolve(staged, "manifest.json"), resolve(destination, "manifest.json"));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function readPackageJson(): Promise<PackageJson> {
  const parsed = parseJsonObject(
    await readFile(resolve(root, "package.json"), "utf8"),
    "package.json",
  );
  if (!isString(parsed["name"]) || !isString(parsed["version"])) {
    throw new Error("package.json has an invalid package name or version");
  }
  return { name: parsed["name"], version: parsed["version"] };
}

async function toolRoot(executable: string): Promise<string> {
  const executablePath = output("sh", ["-c", `command -v ${executable}`]);
  if (!executablePath) {
    throw new Error(`${executable} is not available through Mise`);
  }
  return dirname(dirname(await realpath(executablePath)));
}

async function assertRegularFileInside(path: string, parent: string): Promise<void> {
  const resolved = await realpath(path);
  const resolvedParent = await realpath(parent);
  if (!resolved.startsWith(`${resolvedParent}/`) || !(await stat(resolved)).isFile()) {
    throw new Error(`Expected a regular file inside ${parent}: ${path}`);
  }
}

async function assertDirectoryInside(path: string, parent: string): Promise<void> {
  const resolved = await realpath(path);
  const resolvedParent = await realpath(parent);
  if (
    (resolved !== resolvedParent && !resolved.startsWith(`${resolvedParent}/`)) ||
    !(await stat(resolved)).isDirectory()
  ) {
    throw new Error(`Expected a directory inside ${parent}: ${path}`);
  }
}

async function replaceGeneratedDirectory(source: string, destination: string): Promise<void> {
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const old = resolve(parent, `.${basename(destination)}.old`);
  await rm(old, { recursive: true, force: true });
  try {
    await rename(destination, old);
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
  try {
    await rename(source, destination);
  } catch (error) {
    try {
      await rename(old, destination);
    } catch (restoreError) {
      if (!isMissing(restoreError)) {
        throw new AggregateError([error, restoreError], `Could not replace ${destination}`, {
          cause: restoreError,
        });
      }
    }
    throw error;
  }
  await rm(old, { recursive: true, force: true });
}

function run(command: string, args: string[], extraEnv: Record<string, string> = {}): void {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
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

function output(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.stderr.trim() || "unknown error"}`,
    );
  }
  return result.stdout.trim();
}

function isMissing(error: unknown): error is ErrorWithCode {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === "ENOENT"
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildWasms();
}
