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

The `Open, validate, and merge update` job receives repository and Actions write permission but no
npm identity. It does not install dependencies, build source, execute project scripts, or process
upstream parser code.

It downloads the exact current-run patch artifact, verifies its checksum, applies it, and repeats
the fixed-path allowlist check. It then:

1. creates a unique automation branch;
2. opens a pull request;
3. explicitly dispatches `.github/workflows/ci.yml` for the pull-request commit;
4. waits for that exact commit's `Validate` run;
5. squash-merges the green pull request; and
6. explicitly dispatches `.github/workflows/publish.yml` for the resulting `main` commit when the
   source lock changed.

Explicit dispatch is intentional. Events created with the repository `GITHUB_TOKEN` do not
normally trigger another workflow, which prevents recursive or accidental workflow execution.

## Publication

Publication accepts one exact `source_sha` on `main`.

The read-only build job reconstructs and validates the package, creates one `.tgz`, records its
SHA-256, installs that archive into an isolated consumer project with lifecycle scripts disabled,
loads every package export, and parses a language sample with every WASM. It uploads the archive
through the official artifact action only after this end-to-end test passes. The `npm-publish` job:

- downloads only the immutable artifact ID emitted by its required build job;
- checks out the source commit with persisted credentials disabled;
- runs no dependency installation, project build, test, or package lifecycle script;
- verifies the source commit, archive checksum, exact package paths, package identity, absence of
  consumer dependencies, absence of bundled dependencies, and absence of install lifecycle
  scripts;
- attests the exact `.tgz` and checksum;
- publishes the exact archive with npm trusted publishing and provenance.

The final job has GitHub contents-write permission but no OIDC. It creates the lightweight release
tag and GitHub release only after npm publication succeeds and a separate read-only integration job
downloads the public npm archive, verifies byte equality, and repeats the isolated consumer test.

Retries are idempotent: if npm already has the version, the workflow downloads the public archive
from the npm registry and requires its digest to match the current artifact before finalizing the
GitHub release.
