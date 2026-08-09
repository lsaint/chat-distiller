# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.1.2] - 2026-08-09

### Changed

- Limit default-prompt Obsidian wikilinks to at most five concrete entities
  mentioned in the conversation.

### Fixed

- Keep waiting when the output protocol is temporarily incomplete instead of
  failing from an intermediate DOM snapshot.
- Let recoverable save failures retry extraction from the latest DOM content of
  the original generated response without submitting another prompt.

## [1.1.1] - 2026-08-08

### Fixed

- Fall back to requesting readwrite permission when `queryPermission()` reports a
  stale non-granted state upon side-panel teardown.

## [1.1.0] - 2026-08-07

### Added

- Detect missing or stale content scripts before generation and provide a
  one-click page refresh when the current conversation is not ready.

### Changed

- Streamline first-time local directory authorization with clearer guidance,
  immediate disabled-state help, clickable root settings, and an automatic
  side-panel close countdown that returns users to the popup workflow.
- Add the Chat Distiller icon to the popup header.

### Fixed

- Prevent overlapping side-panel close countdowns when directory selection is
  repeated or disconnected.

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

[Unreleased]: https://github.com/lsaint/chat-distiller/compare/v1.1.2...HEAD
[1.1.2]: https://github.com/lsaint/chat-distiller/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/lsaint/chat-distiller/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/lsaint/chat-distiller/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/lsaint/chat-distiller/releases/tag/v1.0.0
