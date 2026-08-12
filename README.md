# @2h2d/tree-sitter-wasms

Verified, lifecycle-free Tree-sitter grammar WASMs built from exact commits in the official
Tree-sitter language repositories.

## Dictionary

- **Cooldown:** The minimum time a release and its current tag target must remain observed before
  automation may select it.
- **Grammar WASM:** A WebAssembly module containing one generated Tree-sitter parser.
- **Maintenance app:** A GitHub App installed only on this repository and granted narrowly scoped,
  short-lived write access for automated update pull requests.
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
prohibited by the broader npm policy.

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
8. A separate write-only job transfers the validated patch, obtains a short-lived maintenance app
   token, opens a maintenance pull request, waits for `Validate`, merges the green pull request,
   and sends a `publish-package` repository event when package bytes changed.

Every publication tests the exact packed archive in an isolated consumer project before npm
receives it. After publication, a separate read-only job downloads the public npm archive, verifies
byte equality, installs it again, and repeats the complete parser integration test before creating
the GitHub release.

See [docs/AUTOMATION.md](docs/AUTOMATION.md) and
[docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) for the complete state machine and trust
boundaries.

## Repository setup

Before the first automated publication:

1. Create the public npm package and configure npm trusted publishing for
   `2h2d-co/tree-sitter-wasms`, `.github/workflows/publish.yml`, and the `npm-publish`
   environment.
2. Create the `npm-publish` environment and restrict it to the `main` branch.
3. Create a GitHub App with only repository Contents and Pull requests read/write permissions.
   Install it only on `2h2d-co/tree-sitter-wasms`.
4. Create a `maintenance-bot` environment restricted to `main`. Add the app ID as the repository
   variable `MAINTENANCE_APP_ID` and its private key as the environment secret
   `MAINTENANCE_APP_PRIVATE_KEY`.
5. Keep the repository's ordinary `GITHUB_TOKEN` default read-only.
6. Protect `main`: require pull requests, linear history, and the `Validate` check; disable force
   pushes and deletion. Do not require a human approval for the narrowly scoped automated update
   pull requests.
7. Dispatch `Publish npm package` once with the current `main` commit to publish the bootstrap
   version.

Routine releases are then completely GitHub Actions–driven.
