# Chat Distiller Privacy Policy

Effective date: August 5, 2026

Chat Distiller is a Chrome extension that helps users distill an AI chat into a
Markdown file saved in a directory they choose. This policy explains what data
the extension handles and why.

## Data the extension handles

When the user starts a distillation task, Chat Distiller may access:

- the content and metadata of the current supported AI chat, including the
  conversation URL or identifier, user messages, AI responses, and generated
  files or Markdown content;
- the distillation prompt and settings entered by the user;
- task status, generated output awaiting local save, and a one-way hash of the
  prompt used to avoid duplicate work; and
- the name, path information, and browser-granted handle for the local directory
  selected by the user.

The extension handles this data only when needed to provide its user-facing
chat-distillation, duplicate-detection, task-recovery, and local-save features.

## How data is used and stored

Chat Distiller uses chat content to submit the user's distillation prompt in the
current chat, detect the generated result, and save that result as a local
Markdown file. The extension stores settings, task-recovery state, conversation
identifiers, saved-file metadata, and prompt hashes in Chrome's local extension
storage. The selected directory handle is stored locally in the browser's
IndexedDB storage.

Generated Markdown is written only to the local directory selected by the user.
If a save cannot finish, generated output may remain temporarily in local
extension storage so the user can restore directory permission and retry.

Chat Distiller does not operate a developer-controlled backend, does not send
analytics or advertising data, and does not upload chat content or saved files
to the developer.

## Third-party services

At the user's request, Chat Distiller inserts and submits a distillation prompt
to the supported AI chat service open in the current tab. That service already
hosts the current conversation and processes the submitted prompt and generated
response under its own terms and privacy policy. Chat Distiller does not send
the conversation to any additional third party.

## Data sharing and sale

The developer does not sell, rent, or share user data with data brokers,
advertisers, or other third parties. User data is not used for personalized
advertising, creditworthiness, or any purpose unrelated to the extension's
single purpose.

The developer does not have access to or permit humans to read locally handled
user data. The extension's use of user data complies with the Chrome Web Store
User Data Policy, including its Limited Use requirements.

## Retention and deletion

Extension settings and recovery metadata remain in the user's Chrome profile
until the user clears them, clears the extension's site data, or uninstalls the
extension. Temporary task data is replaced or cleared as tasks complete or are
discarded. Files written to the selected directory remain there until the user
deletes them. Users can revoke directory access or choose a different directory
from the extension's settings.

## Security

Chat Distiller limits access to supported HTTPS chat origins and to local
directories explicitly selected and authorized by the user. Data handled by the
extension remains in the user's browser and local filesystem except for the
prompt submitted to the supported AI service as described above.

## Changes to this policy

This policy may be updated if the extension's data practices or applicable
requirements change. The effective date above will be updated when material
changes are made.

## Contact

For privacy questions or requests, contact the developer at ls4int@gmail.com.
