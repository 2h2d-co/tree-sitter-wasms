# Agent Instructions

- This project publishes lifecycle-free Tree-sitter grammar WASMs.
- Use Mise for every tool in `mise.toml`; keep `mise.lock` synchronized and install with
  `mise install --locked`.
- Install npm dependencies with lifecycle scripts disabled.
- Keep the project-level `allow-file=root` exception limited to isolated packed-archive consumer
  tests; do not weaken Git, remote URL, or lifecycle-script policy.
- Run `npm run check`, `npm test`, `npm run build`, and `npm run pack:dry` before committing.
- Run `npm run verify:generated` after changing source pins, build code, or toolchain versions.
- Never add `preinstall`, `install`, or `postinstall`, consumer dependencies, bundled dependencies,
  native Node add-ons, or consumer-side build steps.
- Keep `.github/npm-package-files` synchronized with the exact intended package contents.
- Keep `sources.lock.json`, `upstream-observations.json`, generated WASMs, copied licences, and
  `manifest.json` internally consistent.
- Upstream automation may change only the fixed path allowlist in `maintain.yml`.
- Keep maintenance writes on the short-lived, current-repository GitHub App token; the ordinary
  `GITHUB_TOKEN` must remain read-only.
- Keep all action references pinned to full commit SHAs and keep `jdx/mise-action` confined to
  read-only jobs.
- Do not combine repository-write and npm OIDC permissions in one job.
- Every publication must pass both the pre-publication packed-archive consumer test and the
  post-publication public-registry consumer test before GitHub release finalization.
- Use Conventional Commits. Maintain `CHANGELOG.md` in Keep a Changelog style.
- Routine package releases are action-driven; do not introduce local release commits or manual npm
  tokens without an explicit security-model decision.
- The initial npm publication is the sole manual bootstrap exception because trusted publishing
  requires an existing package. It must publish the exact locally validated and consumer-tested
  archive; the case-specific `--allow-file=all` flag is permitted only for that publish command.
  All subsequent versions use the automated OIDC workflow.
