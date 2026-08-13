# Upstream and Release Automation

## Dictionary

- **Observation:** A recorded tuple of repository, release tag, tag commit, publication time, and
  first-seen time.
- **Selected release:** The release pinned in `sources.lock.json` and used to build package bytes.
- **State-only update:** A pull request that records a new or retargeted release but does not change
  package bytes.
- **Package update:** A pull request that selects an eligible release, rebuilds artifacts, and bumps
  the package patch version.

## Daily discovery

The scheduled workflow reads every paginated GitHub release from each configured repository, with
a defensive limit of 2,000 releases per repository. Draft and prerelease entries are ignored.
Every relevant tag is peeled through annotated tags until it resolves to a 40-character commit
SHA.

An observation remains valid only while its tag resolves to the same commit and the release
publication timestamp remains unchanged. Either change resets `firstObservedAt`.

A release becomes eligible when:

- it is newer than the currently selected release;
- its GitHub publication time is at least `cooldownHours` old; and
- its current tag/commit observation is at least `cooldownHours` old.

The current cooldown is 72 hours. Selection considers all observed releases newer than the current
selection and chooses the newest eligible one. A continuous stream of newer releases therefore
does not indefinitely postpone an older release that completed cooldown.

A retargeted currently selected tag is also treated as an update and must complete a new cooldown
before its replacement commit is selected.

## Update construction

The unprivileged `Discover and validate update` job:

1. Checks out the exact scheduled `main` commit without persisted credentials.
2. Installs the exact Mise lockfile without cross-run caches.
3. Installs npm development dependencies with lifecycle scripts disabled.
4. Discovers releases using an ephemeral read-only GitHub token exposed only to that step.
5. For a package update, bumps the patch version, checks out exact upstream commits, and builds all
   WASMs with the pinned Tree-sitter CLI, WASI SDK, and Binaryen.
6. Copies each upstream licence into `LICENSES/`.
7. Runs formatting, linting, type checking, parser smoke tests, package policy, and a complete
   clean rebuild.
8. Allows only the fixed maintenance file set to differ.
9. Uploads a binary Git patch and checksum through the official artifact action.

No repository-write, npm OIDC, environment, or publication permission exists in that job.

## Pull-request write boundary

The `Open and validate update` job has no npm identity. It does not install dependencies, build
source, execute project scripts, or process upstream parser code. Its `GITHUB_TOKEN` is granted
Actions, Contents, and Pull requests write permissions only for that job. The repository-wide
default remains read-only.

It downloads the exact current-run patch artifact, verifies its checksum, applies it, and repeats
the fixed-path allowlist check. It then:

1. creates or replaces the fixed `automation/upstream-grammars` branch;
2. creates a pull request, or updates the existing open maintenance pull request;
3. explicitly dispatches `.github/workflows/ci.yml` for the exact branch commit;
4. waits for that exact commit's `Validate` run; and
5. stops without merging.

Explicit dispatch is required because pushes and pull requests created with `GITHUB_TOKEN` do not
trigger another workflow automatically. Organization policy allows GitHub Actions to create pull
requests, but the maintenance workflow intentionally contains no merge operation.

A maintainer reviews and merges the validated pull request. If the merge changes
`sources.lock.json`, the authenticated human merge produces a `main` push that starts
`.github/workflows/publish.yml`. Observation-only merges change only
`upstream-observations.json` and do not start a release.

## Publication

Publication accepts one exact `source_sha` on `main`.

The initial npm version is a documented bootstrap exception because npm cannot configure a trusted
publisher for a package that does not yet exist. A maintainer locally validates, packs, consumer
tests, and manually publishes that exact archive. The direct archive argument requires the
case-specific `--allow-file=all` flag; this does not alter the committed `allow-file=root` install
policy.
After trusted publishing is configured, the release workflow is dispatched for the bootstrap
commit: it verifies the archive identity and creates the GitHub artifact attestation, tag, and
release. npm provenance is unavailable for this first manual version.

The read-only build job reconstructs and validates the package, creates one `.tgz`, records its
SHA-256, installs that archive into an isolated consumer project with lifecycle scripts disabled,
loads every package export, and parses a language sample with every WASM. It uploads the archive
through the official artifact action only after this end-to-end test passes. The `npm-publish`
environment job:

- downloads only the immutable artifact ID emitted by its required build job;
- checks out the source commit with persisted credentials disabled;
- runs no dependency installation, project build, test, or package lifecycle script;
- verifies the source commit, archive checksum, exact package paths, package identity, absence of
  consumer dependencies, absence of bundled dependencies, and absence of install lifecycle
  scripts;
- attests the exact `.tgz` and checksum;
- submits the exact archive with OIDC `npm stage publish` and provenance. npm classifies a direct
  tarball stage as a non-root file fetch, so this one command passes `--allow-file=all` after all
  archive checks; dependency installation retains `allow-file=root`;
- records the npm stage ID without making the version publicly installable.

After staging succeeds, a separate job with GitHub contents-write permission but no OIDC verifies
the exact archive and creates the lightweight release tag and GitHub release. A maintainer then
reviews the staged package on npmjs.com and approves it with 2FA. Approval cannot be performed with
the workflow's OIDC token.

If construction or staging fails, recovery uses a new package version on a new exact `main` commit.
The workflow must not relax its current-`main`, exact-SHA, environment, or artifact checks to reuse
the failed version.

Every later version must use the OIDC staged path and human 2FA approval; the bootstrap exception
must not be reused.
