# Security Model

## Dictionary

- **Construction job:** A job that executes project and upstream parser code without publication
  or repository-write authority.
- **Privileged job:** A job with repository write permission, npm OIDC, or environment access.
- **Exact transfer:** Passing an immutable artifact ID and verified digest between jobs instead of
  rebuilding an artifact in a privileged job.
- **OIDC:** The short-lived identity used by npm trusted publishing and GitHub attestations.

## Security objectives

The project is designed to:

- prevent consumer-side native builds and lifecycle execution;
- pin each upstream release to an exact commit;
- delay new and retargeted releases for at least 72 hours;
- compile only generated parser C/C++ sources, without running upstream JavaScript or package
  installation;
- lock build tools and downloads with Mise checksums;
- execute untrusted build inputs without write or publication credentials;
- transfer exact validated archives into credentialed jobs;
- install and exercise the exact archive before staging;
- stage through short-lived npm OIDC with provenance and require human 2FA approval before public
  availability;
- scope npm's required `--allow-file=all` override to submitting the already validated exact
  archive to the stage queue, never dependency installation;
- attest the exact npm archive and checksum;
- reject unexpected package files, consumer dependencies, bundled dependencies, and lifecycle
  scripts.

## Action-driven release authorization

This repository intentionally differs from 2h2d projects that require a locally signed release
commit. Routine grammar updates and releases are fully automated, so no independent local signer
authorizes every generated archive.

Instead, authorization comes from:

1. protected source and workflow changes on `main`;
2. a fixed-path update patch produced by an unprivileged construction job;
3. an explicitly dispatched validation run for the exact update commit;
4. a human merge of the branch-protected maintenance pull request;
5. an exact current-run artifact transfer;
6. a protected `npm-publish` environment;
7. npm trusted-publisher identity bound to this repository, workflow, and environment;
8. npm provenance and GitHub artifact attestations;
9. a GitHub release containing the exact staged archive;
10. maintainer review and 2FA approval of the staged npm package.

This preserves the credential separation and exact-artifact controls from the signed local release
model, but it does not provide the independent local digest assertion.

The first npm version is a one-time exception: npm requires the package to exist before trusted
publishing and staged publishing can be configured. That exact archive is validated and
consumer-tested locally, manually published, then byte-compared, consumer-tested from the public
registry, and GitHub-attested by the workflow. It has no npm provenance. Every subsequent version
must use OIDC staged publishing, GitHub release creation from the staged archive, and maintainer 2FA
approval.

## Privilege separation

| Job                             | Executes upstream/project build code | Repository write | npm OIDC |
| ------------------------------- | ------------------------------------ | ---------------- | -------- |
| Daily discovery/build           | Yes                                  | No               | No       |
| Maintenance pull-request writer | No                                   | `GITHUB_TOKEN`   | No       |
| Pull-request validation         | Yes                                  | No               | No       |
| Release construction            | Yes                                  | No               | No       |
| npm staging                     | No                                   | No               | Yes      |
| GitHub release creation         | No                                   | Yes              | No       |

Third-party `jdx/mise-action` execution is confined to read-only construction and validation jobs.
All Actions references use full commit pins, checkout credentials are not persisted, and cross-run
caches are disabled.

## Residual risks

The controls do not protect against:

- a malicious upstream parser that compiles to malicious-but-valid WASM;
- a compromised pinned compiler or locked dependency;
- a malicious workflow change accepted onto protected `main`;
- compromise of the maintainer account or machine during the one-time initial npm publication;
- compromise of GitHub-hosted runners, GitHub Actions artifact storage, npm, or GitHub OIDC;
- an administrator bypassing repository or environment policy;
- a tag that is retargeted and restored entirely between daily observations;
- action-driven publication producing malicious bytes when the protected construction and
  publication workflows are both maliciously changed.

Security reports should be submitted privately through GitHub's security advisory interface.
