# @2h2d/tree-sitter-wasms

Verified, lifecycle-free Tree-sitter grammar WASMs built from exact commits in the official
Tree-sitter language repositories.

## Dictionary

- **Cooldown:** The minimum time a release and its current tag target must remain observed before
  automation may select it.
- **Grammar WASM:** A WebAssembly module containing one generated Tree-sitter parser.
- **Lifecycle-free:** The package has no `preinstall`, `install`, or `postinstall` script.
- **Source lock:** `sources.lock.json`, which pins every upstream tag to an exact Git commit.

## Included grammars

- JavaScript and JSX
- TypeScript
- TSX
- Python
- Go
- Java
- Scala
- Rust
- C
- C++
- C#
- Bash
- Ruby
- JSON
- HTML
- CSS

The package contains no native Node add-ons, consumer dependencies, or lifecycle scripts.
Consumers download the prebuilt `.wasm` files as ordinary package data; `node-gyp-build` is not
installed or executed.

## Usage

Install a compatible Tree-sitter WebAssembly runtime separately:

```sh
npm install @2h2d/tree-sitter-wasms web-tree-sitter
```

Load a grammar through the exported URL helper:

```ts
import { Language, Parser } from "web-tree-sitter";
import { fileURLToPath } from "node:url";
import { wasmURL } from "@2h2d/tree-sitter-wasms";

await Parser.init();
const language = await Language.load(fileURLToPath(wasmURL("tsx")));
const parser = new Parser();
parser.setLanguage(language);

const tree = parser.parse("const element = <div>Hello</div>;");
```

Direct package subpaths are also exported:

```ts
const pythonWasm = new URL(
  import.meta.resolve("@2h2d/tree-sitter-wasms/wasm/tree-sitter-python.wasm"),
);
```

`manifest.json` records every grammar's source repository, release tag, exact commit, byte size,
and SHA-256 digest.

## Development

The complete toolchain is managed and locked by Mise:

```sh
mise install --locked
npm ci --ignore-scripts
npm run check
npm test
npm run build
npm run pack:dry
```

The project-level `allow-file=root` exception exists only so the release pipeline can install its
freshly constructed local `.tgz` when it is explicitly declared by an isolated consumer project's
root manifest. Lifecycle scripts remain disabled, and Git and remote URL dependencies remain
prohibited by the broader npm policy. The credentialed publication command separately passes
`--allow-file=all` because npm classifies publishing a direct `.tgz` as a non-root file fetch. That
override applies only to the exact current-run archive after its identity, contents, and digest
have been verified; it is never used for dependency installation.

Rebuild or independently reproduce all generated files:

```sh
npm run build:wasms
npm run verify:generated
```

WASM construction checks out exact commits and compiles their already-generated parser sources.
It does not run upstream `grammar.js`, package installation, or upstream lifecycle scripts.

## Automated maintenance

`.github/workflows/maintain.yml` runs every day:

1. It queries stable releases in each official language repository.
2. It resolves each release tag to an exact Git commit.
3. It records the first observation of every newer release.
4. It waits at least 72 hours after both publication and first observation.
5. A retargeted tag resets its observation timer.
6. It selects the newest eligible release, even when a still-newer release remains in cooldown.
7. It rebuilds and validates every generated artifact without write or publication credentials.
8. A separate job with narrowly scoped `GITHUB_TOKEN` permissions transfers the validated patch,
   creates or updates the maintenance pull request, explicitly dispatches `Validate`, and stops.
9. A maintainer reviews and merges the pull request. A `sources.lock.json` change on `main`
   automatically triggers publication; observation-only merges do not publish.

Every publication tests the exact packed archive in an isolated consumer project before npm
receives it. After publication, a separate read-only job downloads the public npm archive, verifies
byte equality, installs it again, and repeats the complete parser integration test before creating
the GitHub release.

See [docs/AUTOMATION.md](docs/AUTOMATION.md) and
[docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) for the complete state machine and trust
boundaries.

## Bootstrap and repository setup

npm trusted publishing can be configured only after the package exists. The initial version is
therefore a one-time manual bootstrap:

1. From the exact clean `main` commit, run all checks, build the package, and create one `.tgz` with
   `npm run pack:ci -- <temporary-directory>`.
2. Run `npm run test:package -- <archive>` against that exact archive.
3. Inspect its SHA-256 and publish the exact file manually with
   `npm publish <archive> --access public --ignore-scripts --allow-file=all`. The
   `allow-file=all` flag is scoped to publishing this exact bootstrap archive; ordinary project and
   consumer-test installs retain `allow-file=root`.
4. Configure npm trusted publishing for `@2h2d/tree-sitter-wasms` using GitHub repository
   `2h2d-co/tree-sitter-wasms`, workflow `publish.yml`, environment `npm-publish`, and the
   `npm publish` action.
5. Dispatch `Publish npm package` with the exact bootstrap commit. The workflow requires the
   already-published archive to be byte-identical, attests it, tests it from the public registry,
   and creates the lightweight tag and GitHub release.

Complete the remaining GitHub setup before enabling routine maintenance:

1. Create the `npm-publish` environment and restrict it to the `main` branch.
2. Keep the repository's ordinary `GITHUB_TOKEN` default read-only while allowing GitHub Actions
   to create pull requests at organization level.
3. Protect `main`: require pull requests, linear history, and the `Validate` check; disable force
   pushes and deletion. Do not require a human approval for the narrowly scoped automated update
   pull requests.

After the one-time manual npm bootstrap and trusted-publisher configuration, routine releases are
completely GitHub Actions–driven.
