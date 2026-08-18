(() => {
  // Core adapter registration and shared adapter defaults.

  function defaultGetCardMountPoint(assistantEl) {
    return assistantEl;
  }

  function defaultGetCollapseTarget(assistantEl) {
    return assistantEl;
  }

  function defaultGetPromptCollapseTarget(assistantEl) {
    if (typeof this.getUserMessages !== "function") {
      return null;
    }
    const userMessages = this.getUserMessages();
    for (let index = userMessages.length - 1; index >= 0; index -= 1) {
      const userMessage = userMessages[index];
      const relation = userMessage.compareDocumentPosition(assistantEl);
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
        return userMessage;
      }
    }
    return null;
  }

  function defaultIsRecoverableProtocolContent() {
    return false;
  }

  function defaultTriggerSend(sendButton) {
    sendButton.click();
  }

  function registerAdapter(adapter) {
    if (!adapter || !adapter.siteId) {
      throw new Error(
        "Chat Distiller: siteId is required to register an adapter.",
      );
    }

    const editor = globalThis.ChatDistiller.editor || {};

    const fullAdapter = {
      // Defaults from editor.js
      insertPrompt: editor.insertPrompt,
      waitForEditorContent: editor.waitForEditorContent,

      // Turn positioning defaults
      getCardMountPoint: defaultGetCardMountPoint,
      getCollapseTarget: defaultGetCollapseTarget,
      getPromptCollapseTarget: defaultGetPromptCollapseTarget,

      // Protocol deviations are opt-in and owned by the affected site.
      isRecoverableProtocolContent: defaultIsRecoverableProtocolContent,

      // Send behavior. A plain click is enough for most sites; frameworks that
      // need a full event sequence override this.
      triggerSend: defaultTriggerSend,

      // Overridable timing defaults
      protocolBlockSelector: "pre code, pre",
      contentStableMs: 5000,
      contentStableWithActionsMs: 1000,
      deferCollapseUntilGenerationStops: false,
      // Delay between prompt insertion and looking for the send button, for
      // sites that re-enable it asynchronously.
      sendButtonSettleMs: 0,

      // Site-supplied overrides
      ...adapter,
    };

    globalThis.ChatDistiller.adapter = fullAdapter;
    return fullAdapter;
  }

  globalThis.ChatDistiller = globalThis.ChatDistiller || {};
  globalThis.ChatDistiller.registerAdapter = registerAdapter;
})();
