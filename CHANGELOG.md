# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.2.2] - 2026-11-28

### Changed

- Update scala: v0.26.2 (b931fcc33839) to v0.26.13 (e8728b1c62ea).
- Update c-sharp: v0.23.5 (cac6d5fb595f) to v0.24.0 (d4bbe18103c3).

### Changed

- Rebuild all grammar WASMs with Tree-sitter 0.27.2, wasi-sdk 34, and Binaryen 133, and record
  that toolchain in `manifest.json`.
- Adopt the shared 2h2d Oxlint policy, including the blanket ban on non-const type assertions.
- Create the GitHub release from the exact staged archive before npm approval.

## [0.2.1] - 2026-08-13

### Added

- Add lifecycle-free Rust, C, C++, C#, Bash, Ruby, JSON, HTML, and CSS Tree-sitter WASMs.

### Fixed

- Submit the exact validated release archive through npm trusted staged publishing.

## [0.1.0] - 2026-08-12

### Added

- Add lifecycle-free JavaScript, TypeScript, TSX, Python, Go, Java, and Scala Tree-sitter WASMs.
- Add action-driven upstream observation, cooldown, validation, and publication.
