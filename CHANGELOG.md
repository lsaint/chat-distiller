# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.4.0] - 2026-08-13

### Changed

- Keep generation, save, success, and error status in the main popup above the
  generate button instead of switching to a separate progress view.
- Dynamically reduce the prompt field by up to two lines when longer status
  messages approach Chrome's popup height limit.

### Fixed

- Keep generation available on Windows when a valid stored directory handle
  temporarily reports that permission needs confirmation.
- Restore DeepSeek Memory cards after a page refresh when the saved Markdown
  uses DeepSeek's restored DOM structure.
- Re-create a previously saved Memory file when it was deleted from disk,
  reusing the existing generated result without sending the prompt again.

## [1.3.2] - 2026-08-12

### Fixed

- Allow exporting a conversation again after new messages are added, while
  preserving reuse of the latest valid saved result.

## [1.3.1] - 2026-08-11

### Changed

- Shorten `rootDirectory` and `subdirectory` label text in popup and settings interfaces.
- Add Chat Distiller brand icon to in-page memory card status header.

## [1.3.0] - 2026-08-10

### Added

- Add DeepSeek site adapter support (`https://chat.deepseek.com/*`) with dedicated DOM selectors and prompt interaction handling.
- Introduce an explicit site adapter registry and modularize core extraction, protocol validation, and card UI logic.

### Changed

- Move task recovery and retry policy into site adapters for platform-specific response handling.
- Refine wikilink generation guidance in default distillation prompts.

## [1.2.0] - 2026-08-10

### Added

- Add compact popup shortcuts for settings, the GitHub project, and supporting
  development, plus an icon-based prompt reset action.

### Changed

- Widen and reorganize the popup into a compact field layout for clearer root
  directory, subdirectory, and filename controls.
- Recommend Chrome Web Store installation in the README and add attributable
  support links.

### Fixed

- Check the stored directory handle's current read-write permission before
  enabling generation, and make directory status fields directly actionable.

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

[Unreleased]: https://github.com/lsaint/chat-distiller/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/lsaint/chat-distiller/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/lsaint/chat-distiller/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/lsaint/chat-distiller/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/lsaint/chat-distiller/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/lsaint/chat-distiller/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/lsaint/chat-distiller/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/lsaint/chat-distiller/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/lsaint/chat-distiller/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/lsaint/chat-distiller/releases/tag/v1.0.0
