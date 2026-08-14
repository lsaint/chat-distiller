(() => {
  // Gemini Site Adapter — Gemini-specific DOM selectors and site behavior.
  // Registered as globalThis.ChatDistiller.adapter for the core engine to consume.

  const { getElementText, isVisible } = globalThis.ChatDistiller.dom;
  const { isThinkingOnlyText } = globalThis.ChatDistiller.editor;
  const { CARD_ATTRIBUTE } = globalThis.ChatDistiller.cardUi;
  const {
    MEMORY_PROTOCOL_MARKER,
    extractProtocolFilename,
    stripProtocolMarker,
  } = globalThis.ChatDistiller.protocol;

  function findPromptEditor() {
    const selectors = [
      'rich-textarea .ql-editor[contenteditable="true"][role="textbox"]',
      'rich-textarea [contenteditable="true"]',
      '[data-test-id="textarea-wrapper"] .ql-editor[contenteditable="true"]',
      '.text-input-field_textarea .ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"][aria-multiline="true"]',
      'div[contenteditable="true"][role="textbox"]',
    ];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (isVisible(element) && !element.closest('[aria-hidden="true"]')) {
          return element;
        }
      }
    }

    return null;
  }

  function getInputContainer() {
    const editor = findPromptEditor();
    if (!editor) {
      return null;
    }

    return (
      editor.closest('.text-input-field') ||
      editor.closest('[data-test-id="textarea-inner"]')?.parentElement ||
      editor.closest('input-area-v2') ||
      editor.parentElement
    );
  }

  function isStopButton(button) {
    if (!button) {
      return false;
    }

    const label = (
      button.getAttribute('aria-label') ||
      button.getAttribute('data-tooltip') ||
      button.getAttribute('mattooltip') ||
      button.getAttribute('title') ||
      getElementText(button)
    )
      .trim()
      .toLowerCase();

    return (
      label.includes('stop') ||
      label.includes('停止') ||
      label.includes('中断') ||
      button.classList.contains('stop') ||
      button.classList.contains('cancel')
    );
  }

  function findSendButton() {
    const container = getInputContainer() || document;
    const selectors = [
      'button.send-button.submit',
      '.send-button-container button',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'button[aria-label*="提交"]',
    ];

    for (const selector of selectors) {
      for (const button of container.querySelectorAll(selector)) {
        if (
          button instanceof HTMLButtonElement &&
          isVisible(button) &&
          !isStopButton(button) &&
          button.getAttribute('aria-disabled') !== 'true'
        ) {
          return button;
        }
      }
    }

    return null;
  }

  function getAssistantMessages() {
    return Array.from(document.querySelectorAll('.conversation-container model-response'));
  }

  function getUserMessages() {
    return Array.from(document.querySelectorAll('.conversation-container user-query'));
  }

  function getAssistantFromNode(node) {
    return node?.closest('model-response') || null;
  }

  function isGenerationActive() {
    const busyResponse = Array.from(
      document.querySelectorAll(
        'model-response message-content .markdown[aria-busy="true"], ' +
          'model-response [aria-live="polite"][aria-busy="true"]',
      ),
    ).some(isVisible);
    if (busyResponse) {
      return true;
    }

    const inputContainer = getInputContainer();
    if (inputContainer) {
      const buttons = inputContainer.querySelectorAll('button');
      if (Array.from(buttons).some((button) => isVisible(button) && isStopButton(button))) {
        return true;
      }
    }

    const stopSelectors = [
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止"]',
      'button[aria-label*="中断"]',
      'button.stop',
      'button.cancel',
    ];

    return stopSelectors.some((selector) =>
      Array.from(document.querySelectorAll(selector)).some(isVisible),
    );
  }

  function hasResponseActions(el) {
    const response = el?.closest('model-response');
    if (!response) {
      return false;
    }

    if (response.querySelector('message-actions')) {
      return true;
    }

    return Array.from(response.querySelectorAll('button, gem-icon-button')).some(
      (button) => {
        if (
          button.closest('pre, code') ||
          button.closest(`[${CARD_ATTRIBUTE}]`)
        ) {
          return false;
        }

        const label = (
          button.getAttribute('aria-label') ||
          button.getAttribute('arialabel') ||
          button.getAttribute('gemtooltip') ||
          button.getAttribute('data-test-id') ||
          button.getAttribute('title') ||
          getElementText(button)
        )
          .trim()
          .toLowerCase();

        return [
          'copy',
          'retry',
          'regenerate',
          'thumb-up',
          'thumb-down',
          '复制',
          '重试',
          '重新生成',
          '答得好',
          '答得不好',
        ].some((keyword) => label.includes(keyword));
      },
    );
  }

  async function extractMessageText(el) {
    if (!el) {
      return '';
    }

    const mainContent =
      el.querySelector('message-content .markdown') ||
      el.querySelector('message-content') ||
      el.querySelector('.model-response-text') ||
      el;

    const clone = mainContent.cloneNode(true);
    clone
      .querySelectorAll(`[${CARD_ATTRIBUTE}]`)
      .forEach((node) => node.remove());

    const noiseSelectors = [
      '.thoughts-container',
      'thoughts-header',
      'model-thoughts',
      'message-actions',
      'sources-carousel',
      'source-footnote',
      'citation-footnote',
      'details',
    ];
    for (const selector of noiseSelectors) {
      clone.querySelectorAll(selector).forEach((node) => node.remove());
    }

    const codeBlocks = Array.from(clone.querySelectorAll('pre code'));
    if (codeBlocks.length > 0) {
      codeBlocks.sort(
        (a, b) => getElementText(b).trim().length - getElementText(a).trim().length,
      );
      const codeText = getElementText(codeBlocks[0]).trim();
      if (codeText.length > 10 && !isThinkingOnlyText(codeText)) {
        return codeText;
      }
    }

    const text = (clone.innerText || clone.textContent || '').trim();
    if (isThinkingOnlyText(text)) {
      return '';
    }

    return text;
  }

  function isRecoverableProtocolContent(content) {
    const normalized = String(content || '').trim();
    return (
      normalized.startsWith(MEMORY_PROTOCOL_MARKER) &&
      Boolean(extractProtocolFilename(normalized)) &&
      Boolean(stripProtocolMarker(normalized))
    );
  }

  function getConversationTitle() {
    const title = document.title
      .replace(/\s*[-–—]\s*Google Gemini\s*$/i, '')
      .replace(/\s*[-–—]\s*Gemini\s*$/i, '')
      .trim();

    return title || 'chat-memory';
  }

  globalThis.ChatDistiller.registerAdapter({
    siteId: 'gemini',

    protocolBlockSelector:
      'model-response message-content pre code, ' +
      'model-response message-content pre, ' +
      'model-response message-content .markdown',
    contentStableWithActionsMs: 500,
    deferCollapseUntilGenerationStops: true,

    findPromptEditor,
    findSendButton,

    getAssistantMessages,
    getUserMessages,
    getAssistantFromNode,

    isGenerationActive,
    hasResponseActions,

    extractMessageText,
    isRecoverableProtocolContent,
    getConversationTitle,
  });
})();
