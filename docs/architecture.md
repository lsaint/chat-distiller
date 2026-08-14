# Architecture

Chat Distiller separates browser UI lifecycles, persistent task coordination,
site-specific DOM behavior, and file access. This keeps a popup closing or a
chat site's markup changing from invalidating the entire workflow.

## Component Boundaries

```text
chat-distiller/
├── manifest.json
├── popup.html / popup.js          # Configure and start a task
├── sidepanel.html / sidepanel.js  # Directory authorization and recovery
├── service-worker.js              # Persistent task coordination
├── db-utils.js                    # Browser-managed directory handle
├── file-utils.js                  # Validated local file writes
├── sites.js                       # Site metadata and conversation ID rules
└── src/
    ├── core/
    │   ├── protocol.js            # Output parsing and integrity checks
    │   ├── dom-utils.js           # Shared DOM primitives
    │   ├── card-ui.js             # In-conversation task card
    │   ├── editor.js              # Shared prompt editor and content utilities
    │   ├── adapter-registry.js    # Adapter registration and shared defaults
    │   └── engine.js              # Generation, extraction, and delivery
    ├── site/
    │   ├── chatgpt.js             # ChatGPT-specific DOM adapter
    │   ├── deepseek.js            # DeepSeek-specific DOM adapter
    │   └── gemini.js              # Gemini-specific DOM adapter
    └── content-entry.js           # Adapter validation and engine startup
```

- The popup owns configuration, task start, and status display. Long-running
  work never depends on the popup remaining open.
- The content layer submits the visible prompt, observes the current response,
  validates Markdown, and delivers a result tagged with its task and tab.
- The service worker stores task state in `chrome.storage.local`, restores
  progress, applies timeouts, and coordinates the final write.
- The side panel keeps directory authorization alive while Chrome's folder
  picker has focus and resumes writes that were waiting for permission.

## Content Layer

Manifest V3 loads the content files as classic scripts in a defined order.
Every file uses an IIFE to isolate top-level declarations and shares only the
explicit `globalThis.ChatDistiller` interface. The active site adapter registers
before the engine starts.

Shared core code must not read site-specific selectors or message structures.
Those assumptions belong in `src/site/<siteId>.js`. Site metadata needed by the
popup or service worker belongs in `sites.js`, because module service workers
cannot import a classic content script.

The engine owns protocol timing and state transitions. A site adapter may opt
into recovery for a known rendering or model-output deviation through
`isRecoverableProtocolContent(content)`, but the core still decides when the
response is final and stable enough to use that recovery.

## Task Lifecycle

```text
idle → generating → saving → success
                    ↓
            awaiting_permission
                    ↓
                  saving
```

Generation and result delivery use persistent task IDs. Closing the popup does
not stop a task. Closing, refreshing, or navigating the conversation tab ends
the corresponding page task so it cannot remain indefinitely active.

The in-conversation card is both status feedback and a recovery surface. A
successful card is terminal; delayed polling results must not move it back to a
working state.

## Output Integrity

Each task appends an output protocol to the prompt. A valid response contains a
version marker, a lowercase kebab-case filename, an outer four-backtick Markdown
fence, and an explicit completion marker. Four backticks allow ordinary
three-backtick code blocks inside the note.

The extractor rejects missing markers, incomplete responses, and content still
being generated. It never saves a partial response merely because the visible
text stopped changing briefly. Site-specific recovery is disabled by default
and requires both an explicit adapter hook and the core finality checks.

## Duplicate and Recovery Behavior

After saving, Chat Distiller records the site conversation key, relative file
path, and prompt fingerprint. If the file still exists, a repeated save is
skipped. If it was removed and the prompt fingerprint still matches, a valid
existing protocol response may be reused without generating another answer.

When directory permission expires, the validated result remains recoverable in
task state until the user authorizes the directory again.
