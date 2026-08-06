# Site Adapter Guide

A Site Adapter contains every DOM assumption for one AI chat product. The core
engine controls the common task lifecycle and should not know how a particular
site names messages, editors, send buttons, or generation controls.

## Add a Site

1. Create `src/site/<siteId>.js` and wrap its declarations in an IIFE.
2. Implement the same adapter interface registered by `src/site/chatgpt.js`.
3. Register the adapter with `ChatDistiller.registerAdapter()`.
4. Add the site's metadata to `SUPPORTED_SITES` in `sites.js`.
5. Add a dedicated `content_scripts` entry and the narrowest HTTPS host
   permission to `manifest.json`.
6. Load shared core files first, then the adapter, `engine.js`, and finally
   `content-entry.js`.
7. Verify prompt submission, generation detection, extraction, retry, duplicate
   detection, tab navigation, and directory reauthorization on the real site.

## Interface Boundary

Use `src/site/chatgpt.js` as the executable reference for the current adapter
interface. Registration keys must exactly match what `engine.js` consumes. Do
not add speculative hooks: an unused interface creates a false extension point
and makes later changes harder to reason about.

The adapter owns:

- locating user and assistant turns;
- locating and updating the editor;
- triggering a user-visible send action;
- detecting visible stop or interrupt controls;
- identifying response-level final actions;
- mapping distillation turns to the compact status card.

The adapter does not own protocol validation, task persistence, local file
writes, retry policy, or shared card state transitions.

## Site Metadata

`sites.js` is the single source for site IDs, supported origins, and
conversation ID parsing. The popup and service worker import this module.
Conversation parsing must not be duplicated in an adapter.

The manifest cannot import `SUPPORTED_SITES`, so its `matches` and
`host_permissions` entries must be updated manually and reviewed alongside
`sites.js`. Use explicit HTTPS origins; never add a broad all-sites permission.

Conversation keys use `<siteId>:<conversationId>`. If the current site ID is
missing, recover it from the page URL when possible and log a warning when it
cannot be identified. An empty key silently disables saved-file detection and
result reuse, so it must not be treated as a harmless default.

## DOM Failure Rules

AI chat pages do not provide a stable extension DOM API. Selectors should fail
clearly and stop the current action. Do not guess at an unrelated control,
silently reuse an older response, or repeatedly submit prompts after a site
change or human-verification challenge.
