# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.0.0] - 2026-08-06

### Added

- Distill supported ChatGPT conversations into concise, structured Markdown
  notes and save them directly to a user-authorized local directory.
- Validate generated notes with a versioned output protocol before saving.
- Keep long-running generation and save tasks recoverable through the extension
  background worker, popup, in-page status card, and side panel.
- Avoid duplicate saves and reuse valid generated results when appropriate.
- Provide English and Simplified Chinese interfaces, local-first storage, and a
  documented Site Adapter interface for future AI chat platforms.
- Distribute the same deterministic extension ZIP through the Chrome Web Store
  submission process and GitHub Releases.

[Unreleased]: https://github.com/lsaint/chat-distiller/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lsaint/chat-distiller/releases/tag/v1.0.0
