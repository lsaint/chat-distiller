# Local Storage and Privacy

Chat Distiller has no developer-controlled backend, analytics service, or cloud
storage. It operates in the active AI chat page and writes generated Markdown
to a directory the user explicitly authorizes.

## Data Locations

| Data | Location | Purpose |
| --- | --- | --- |
| Generated Markdown | Authorized local directory | User-owned note output |
| Settings and default prompt | `chrome.storage.local` | Extension configuration |
| Task and recovery state | `chrome.storage.local` | Resume work after UI closure |
| Conversation IDs and prompt fingerprints | `chrome.storage.local` | Duplicate detection and safe reuse |
| Directory handle | Browser-managed IndexedDB | Future local writes after authorization |

Chat content is not sent to a server controlled by the extension developer.
The only AI request is the distillation prompt visibly submitted to the chat
service already hosting the current conversation.

## Permissions

- `storage` stores configuration and recoverable task metadata.
- `alarms` wakes the background worker to recover tasks and enforce timeouts.
- `sidePanel` keeps directory authorization and recovery UI available while the
  folder picker is open.
- Host permissions cover only the explicitly supported HTTPS chat origins in
  `manifest.json`.

The exact manifest is authoritative. New site support must add only the narrow
origin required for that adapter.

## User Control

Prompt insertion and submission occur visibly in the active tab after a user
action. Chat Distiller does not run unattended batch generation or silently
submit background conversations.

Users control the output directory and can remove generated notes at any time.
Clearing extension data or uninstalling the extension removes browser-managed
settings and recovery metadata. Moving the selected directory or changing
system permissions can require authorization again.

See the [Privacy Policy](../PRIVACY.md) for the complete policy and deletion
instructions.
