# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Record Tree-sitter 0.26.12 as the reproducible WASM build toolchain.
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
