(() => {
// Content script entry point. Validates that an adapter is registered, then
// starts the core engine. Loaded last in the manifest content_scripts.js array.

if (!globalThis.ChatDistiller?.adapter) {
  console.error("Chat Distiller: no site adapter registered, aborting.");
} else {
  globalThis.ChatDistiller.engine.observeProtocolMessages();
}
})();
