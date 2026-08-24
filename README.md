<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.png">
    <img src="docs/assets/logo-light.png" alt="Chat Distiller logo" width="160">
  </picture>
</p>

<h1 align="center">Chat Distiller</h1>

<p align="center">
  Turn browser AI conversations into reusable local Markdown with prompts you control.
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Chrome 116+](https://img.shields.io/badge/Chrome-116%2B-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)
![Languages: English | 简体中文](https://img.shields.io/badge/languages-English%20%7C%20简体中文-blue.svg)

[Install from Chrome Web Store](https://chromewebstore.google.com/detail/chat-distiller/jmnnlhpgihkbffhlkhemmbldajnfoalm) ·
[GitHub Releases](https://github.com/lsaint/chat-distiller/releases/latest) ·
[简体中文](README.zh-CN.md) · [Privacy Policy](PRIVACY.md) ·
[Aikito](https://github.com/lsaint/aikito)

Chat Distiller is a Chrome extension that runs a configurable prompt inside your current AI conversation, validates the generated Markdown, and saves it directly to a local folder you control.

There is no developer-controlled backend, analytics service, or cloud storage. It works independently with any local Markdown directory (Obsidian, Git repos, or local folders), and can also companion with [Aikito](https://github.com/lsaint/aikito).

<p align="center">
  <img src="docs/assets/chat-distiller-overview.png" alt="Chat Distiller overview">
</p>

## Why Chat Distiller

AI conversations frequently generate valuable knowledge, but raw transcripts are noisy and different workflows require different outputs. Chat Distiller provides a built-in distillation prompt out of the box, while letting you define your own prompts to transform the current AI conversation into structured local Markdown.

`Memory notes` · `Decisions` · `TODOs` · `Project context` · `Study notes` · `Documentation` · `Custom templates`

See [Why Chat Distiller](docs/why-chat-distiller.md) for the full background.

| Raw Conversation                                                                                                        | Prompt-Driven Markdown                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Noisy & Verbose**: Full chat transcripts contain trial-and-error, repetition, and temporary debugging context.        | **Clean & Structured**: High-signal Markdown shaped by your prompt and written directly to your authorized local folder.         |
| **High Overhead**: Hard to review manually and wastes context tokens when fed back to Coding Agents or knowledge bases. | **Workflow-Ready**: Extracted decisions, action items, or project context formatted exactly how your notes or tools expect them. |

## How It Works

1. Authorize a local root directory during first-time setup.
2. Open a supported AI conversation.
3. Select **Generate and save** from the extension popup (optionally specifying a custom subdirectory or filename).
4. Chat Distiller visibly inserts and submits your configured prompt in the current conversation.
5. The AI generates a structured Markdown result, which the extension validates.
6. The background task writes the note to your directory (defaults to `inbox/`). If no filename is entered, it uses the AI-generated filename, falling back to a time-and-title format.

You can close the popup after starting a task; reopening it restores progress. If saving fails, the conversation status card offers a retry option, and the side panel lets you reauthorize expired directory permissions.

Chat Distiller records saved conversation metadata to prevent duplicate saves and can reuse existing valid prompt results.

## Supported Sites

- ChatGPT
- DeepSeek
- Gemini
- Doubao
- Perplexity

Additional AI chat sites can be added through the Site Adapter interface.

## Installation

### Option 1: Chrome Web Store (Recommended)

[Install Chat Distiller from the Chrome Web Store](https://chromewebstore.google.com/detail/chat-distiller/jmnnlhpgihkbffhlkhemmbldajnfoalm).

### Option 2: Install from GitHub Release

1. Open the [latest GitHub Release](https://github.com/lsaint/chat-distiller/releases/latest).
2. Under **Assets**, download `chat-distiller-*.zip`. Do not download the automatically generated **Source code** archives.
3. Extract the downloaded ZIP.
4. Open `chrome://extensions` in Chrome and enable **Developer mode**.
5. Select **Load unpacked** and choose the extracted directory.
6. Open Chat Distiller and authorize a local root directory.

Each GitHub Release also provides a `.sha256` file for verifying the extension archive. The release ZIP contains the same runtime files as the corresponding Chrome Web Store submission package.

### Option 3: Install from Source

1. Clone this repository.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Select **Load unpacked** and choose the repository directory.
4. Open Chat Distiller and authorize a local root directory.

Chat Distiller requires Chrome 116 or later.

## Works with [Aikito](https://github.com/lsaint/aikito)

To use Chat Distiller with [Aikito](https://github.com/lsaint/aikito), select your Aikito workspace as the authorized root directory. New notes will be saved to `inbox/` by default, ready for review and organization into durable memory.

```mermaid
flowchart LR
    A["Browser AI conversation"] -->|"Transform with Chat Distiller"| B["Aikito inbox/"]
    B -->|"Review & Archive"| C["Git-Managed Memory"]
    B -->|"Direct Use"| D["Coding Agents"]
    C -->|"Reuse Context"| D
```

## Privacy & Permissions

Chat Distiller operates strictly locally with zero external tracking servers:

- **Local Files & Storage**: Generated Markdown is written only to your authorized folder. Settings, task state, and prompt fingerprints stay in Chrome extension storage (`storage` permission), while directory handles remain in local IndexedDB.
- **No Third-Party Backend**: Chat content is never uploaded to external servers. The only AI request is the prompt submitted in your active browser chat session (`host_permissions` limited strictly to supported HTTPS chat origins).
- **Background Tasks & Side Panel**: Uses `alarms` to recover pending tasks/timeouts and `sidePanel` to maintain directory authorization flows during folder selection.

See our [Privacy Policy](PRIVACY.md) and [Local Storage and Privacy](docs/local-storage-and-privacy.md) for full details.

## Design Choices

- **Prompt-driven transformation, not transcript scraping.** The default prompt distills reusable knowledge, while custom prompts control what to extract and how to structure the note. Chat Distiller automatically appends the required output protocol so the result can be validated and saved reliably.
- **A strict output protocol.** Generated content is validated before it is saved, so incomplete or malformed results are rejected instead of silently written to disk.
- **No generated timestamp in the note body.** The note focuses on the knowledge itself; filenames and filesystem metadata can carry operational timing.
- **Compact conversation UI.** The submitted prompt and generated response collapse into a status card with an explicit option to reveal the content.
- **No silent overwrite.** Filename collisions receive a numeric suffix.
- **User-visible automation.** Prompt insertion and submission happen in the active chat and only after a user action.

## Internationalization

The extension supports English and Simplified Chinese. Chrome locales matching `zh-*` use Simplified Chinese; other locales use English.

Manifest text, popup and side-panel UI, status cards, and runtime messages use Chrome i18n resources.

The default distillation prompt follows the interface language. Once edited, a custom prompt is preserved across extension upgrades and language changes until the user selects **Reset to default**.

## Architecture

The content layer uses a **Site Adapter** architecture. Shared protocol, state-machine, DOM utility, and card UI code is separated from site-specific selectors and editor behavior.

Read the [Architecture](docs/architecture.md) guide for component boundaries, task ownership, and the output protocol. To add another AI chat platform, use the [Site Adapter Guide](docs/site-adapters.md).

## Documentation

- [Documentation index](docs/README.md)
- [Why Chat Distiller](docs/why-chat-distiller.md)
- [Architecture](docs/architecture.md)
- [Site Adapter Guide](docs/site-adapters.md)
- [Local Storage and Privacy](docs/local-storage-and-privacy.md)
- [Troubleshooting](docs/troubleshooting.md)

## Contributing

Issues and pull requests are welcome.

When adding a new site adapter, keep permissions limited to the narrowest supported HTTPS origin and avoid duplicating shared protocol or state-machine logic in site-specific code.

Run the local release gates before opening a pull request:

```bash
node scripts/smoke-check.js
python3 scripts/package-extension.py --check
python3 -m unittest discover -s tests
```

To build the deterministic runtime-only Chrome Web Store archive and checksum, run `python3 scripts/package-extension.py`. Existing version artifacts are never overwritten.

## Support

If you find Chat Distiller useful, you can [support its development](https://lsaint.github.io/donation/?utm_source=github&utm_medium=readme&utm_campaign=chat-distiller).
