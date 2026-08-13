# Agent Instructions

- This project publishes lifecycle-free Tree-sitter grammar WASMs.
- Use Mise for every tool in `mise.toml`; keep `mise.lock` synchronized and install with
  `mise install --locked`.
- Install npm dependencies with lifecycle scripts disabled.
- Keep the project-level `allow-file=root` exception limited to isolated packed-archive consumer
  tests. The credentialed staging job may pass `--allow-file=all` only to stage the exact
  current-run archive after its identity, contents, and digest are verified; do not use that
  override for installation or weaken Git, remote URL, or lifecycle-script policy.
- Run `npm run check`, `npm test`, `npm run build`, and `npm run pack:dry` before committing.
- Run `npm run verify:generated` after changing source pins, build code, or toolchain versions.
- Never add `preinstall`, `install`, or `postinstall`, consumer dependencies, bundled dependencies,
  native Node add-ons, or consumer-side build steps.
- Keep `.github/npm-package-files` synchronized with the exact intended package contents.
- Keep `sources.lock.json`, `upstream-observations.json`, generated WASMs, copied licences, and
  `manifest.json` internally consistent.
- Upstream automation may change only the fixed path allowlist in `maintain.yml`.
- Keep the repository-wide `GITHUB_TOKEN` default read-only. Grant Actions, Contents, and Pull
  requests write permissions only to the maintenance PR writer job.
- Maintenance automation may create or update its pull request and dispatch validation, but it must
  never merge the pull request.
- Commit and push maintainer-directed changes directly to `main`; do not create pull requests for
  them. Scheduled upstream maintenance remains pull-request based.
- Keep all action references pinned to full commit SHAs and keep `jdx/mise-action` confined to
  read-only jobs.
- Do not combine repository-write and npm OIDC permissions in one job.
- Every staged release must pass the packed-archive consumer test before npm staging.
- Every routine npm version must be submitted with OIDC `npm stage publish`, reviewed and approved
  by a maintainer with 2FA, and released on GitHub from the exact staged archive.
- If a release attempt fails before publication or staging completes, increment the package version
  and release from a new exact `main` commit. Never weaken current-`main`, exact-SHA, artifact, or
  environment checks to recover an old version.
- Use Conventional Commits. Maintain `CHANGELOG.md` in Keep a Changelog style.
- Routine package releases are action-driven; do not introduce local release commits or manual npm
  tokens without an explicit security-model decision.
- The initial npm publication is the sole manual bootstrap exception because trusted publishing
  requires an existing package. It must publish the exact locally validated and consumer-tested
  archive. All subsequent versions use the automated OIDC staged workflow. Both paths require
  `--allow-file=all` because npm classifies direct archive publication or staging as a non-root file
  fetch; this exception is limited to submitting the already validated archive.
