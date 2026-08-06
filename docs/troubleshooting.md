# Troubleshooting

## The Extension Cannot Save

Reopen Chat Distiller from the in-conversation status card or side panel and
authorize the local root directory again. A generated result waiting for
permission is retained so the AI normally does not need to regenerate it.

Authorization may be required again after clearing Chrome extension data,
uninstalling the extension, moving the selected directory, or changing system
file permissions.

## The Output Is Rejected as Incomplete

Chat Distiller requires the filename, protocol start marker, outer four-backtick
fence, and completion marker. A missing marker means the response may be
truncated, so the extension refuses to save it.

Retry generation after the current response has fully stopped. If a custom
prompt was edited, reset it to the default and try again so the current output
protocol is restored.

## Generation Times Out

Very long conversations can exceed the task timeout. Confirm the site is no
longer generating, then retry. If the page displays a human-verification step or
service error, complete it manually before starting another task; the extension
does not bypass challenges or repeatedly submit prompts.

## Generate and Save Cannot Find the Editor or Send Button

The chat site may have changed its DOM. Reload the page once and retry on a
normal conversation URL. If the failure persists, report the browser version,
extension version, site URL pattern, interface language, and the visible error.
Do not include private conversation content in a public issue.

## A Conversation Is Reported as Already Saved

Chat Distiller records each supported conversation and its saved relative path.
If the file still exists, duplicate generation is skipped. To create another
note intentionally, choose a different conversation or adjust the workflow
rather than deleting browser storage indiscriminately.

If the recorded file was deleted, Chat Distiller may reuse the last valid result
when its prompt fingerprint still matches. Changing the distillation prompt
forces a new result.

## The Status Card Looks Stale

Reopen the extension popup to reload persistent task state. If the conversation
tab was refreshed, closed, or navigated during generation, start a new task on
the current conversation.
