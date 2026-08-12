import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [packageName, version, expectedDigest, destinationArgument] = process.argv.slice(2);
if (
  packageName !== "@2h2d/tree-sitter-wasms" ||
  !version ||
  !/^[0-9a-f]{64}$/.test(expectedDigest ?? "") ||
  !destinationArgument ||
  process.argv.length !== 6
) {
  throw new Error(
    "Usage: node scripts/verify-published-package.ts @2h2d/tree-sitter-wasms <version> <sha256> <destination.tgz>",
  );
}

const destination = resolve(destinationArgument);
const metadataUrl = `https://registry.npmjs.org/@2h2d%2ftree-sitter-wasms/${encodeURIComponent(version)}`;
let lastError: unknown;
for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const metadataResponse = await fetch(metadataUrl);
    if (!metadataResponse.ok) {
      throw new Error(`metadata returned HTTP ${metadataResponse.status}`);
    }
    const metadata: unknown = await metadataResponse.json();
    const tarballUrl = readTarballUrl(metadata);
    const archiveResponse = await fetch(tarballUrl);
    if (!archiveResponse.ok) {
      throw new Error(`archive returned HTTP ${archiveResponse.status}`);
    }
    const archive = Buffer.from(await archiveResponse.arrayBuffer());
    const digest = createHash("sha256").update(archive).digest("hex");
    if (digest !== expectedDigest) {
      throw new Error(`public archive digest ${digest} does not match ${expectedDigest}`);
    }
    await writeFile(destination, archive);
    console.log(`Verified public ${packageName}@${version} at ${expectedDigest}`);
    lastError = undefined;
    break;
  } catch (error) {
    lastError = error;
    if (attempt < 30) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000));
    }
  }
}
if (lastError) {
  throw new AggregateError(
    [lastError],
    `Public ${packageName}@${version} did not become available`,
  );
}

function readTarballUrl(value: unknown): string {
  if (
    typeof value !== "object" ||
    value === null ||
    !("dist" in value) ||
    typeof value.dist !== "object" ||
    value.dist === null ||
    !("tarball" in value.dist) ||
    typeof value.dist.tarball !== "string" ||
    !value.dist.tarball.startsWith("https://registry.npmjs.org/@2h2d/tree-sitter-wasms/-/")
  ) {
    throw new Error("npm registry returned an unexpected tarball URL");
  }
  return value.dist.tarball;
}
