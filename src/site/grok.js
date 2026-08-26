(() => {
  // Grok Site Adapter — Grok-specific DOM selectors and site behavior.
  // Registered as globalThis.ChatDistiller.adapter for the core engine to consume.

  const { getElementText, getLongestCodeText, isVisible, sleep } =
    globalThis.ChatDistiller.dom;
  const { isThinkingOnlyText } = globalThis.ChatDistiller.editor;
  const { CARD_ATTRIBUTE } = globalThis.ChatDistiller.cardUi;
  const {
    MEMORY_PROTOCOL_MARKER,
    extractProtocolFilename,
    stripProtocolMarker,
  } = globalThis.ChatDistiller.protocol;

  function findPromptEditor() {
    const selectors = [
      'div[data-testid="chat-input"] [contenteditable="true"]',
      'div.query-bar [contenteditable="true"]',
      'div.query-bar-editor[contenteditable="true"]',
      'div.tiptap.ProseMirror[contenteditable="true"]',
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[aria-label="Ask Grok anything"]',
      'form div[contenteditable="true"]',
      'div[contenteditable="true"]',
      "textarea",
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (
          isVisible(element) &&
          !element.closest('[aria-hidden="true"]') &&
          element.getAttribute("aria-hidden") !== "true"
        ) {
          return element;
        }
      }
    }

    return null;
  }

  function getInputContainer() {
    const editor = findPromptEditor();
    if (!editor) return null;

    return (
      editor.closest("form") ||
      editor.closest(".query-bar") ||
      editor.closest('[data-testid="chat-input"]')?.parentElement ||
      editor.parentElement
    );
  }

  function isAccessoryButton(button) {
    if (!button) return true;
    if (
      button.getAttribute("data-testid") === "attach-button" ||
      button.id === "model-select-trigger" ||
      button.closest('[data-query-bar-mode-select="true"]')
    ) {
      return true;
    }
    const label = (
      button.getAttribute("aria-label") ||
      button.getAttribute("title") ||
      getElementText(button)
    ).toLowerCase();

    return (
      label.includes("附件") ||
      label.includes("attach") ||
      label.includes("模型") ||
      label.includes("model") ||
      label.includes("听写") ||
      label.includes("dictat") ||
      label.includes("语音模式") ||
      label.includes("voice")
    );
  }

  function isButtonInStopState(button) {
    if (!button) return false;

    const label = (
      button.getAttribute("aria-label") ||
      button.getAttribute("title") ||
      getElementText(button)
    )
      .trim()
      .toLowerCase();

    if (
      label.includes("stop") ||
      label.includes("停止") ||
      label.includes("中断") ||
      label.includes("cancel")
    ) {
      return true;
    }

    const rect = button.querySelector("svg rect, svg path[d*='M4 9.2']");
    if (rect) {
      return true;
    }

    return false;
  }

  function isGenerationActive() {
    const stopSelectors = [
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止"]',
      'button[aria-label*="中断"]',
      'button[aria-label*="Cancel"]',
      'button[aria-label*="Interrupt"]',
      'button[data-testid*="stop"]',
      'button[data-testid="stop-button"]',
      '[aria-label*="Stop generating"]',
      '[aria-label*="停止生成"]',
      '[aria-label*="停止模型响应"]',
    ];

    const hasStopButton = stopSelectors.some((selector) =>
      Array.from(document.querySelectorAll(selector)).some(
        (btn) => isVisible(btn) && !btn.disabled,
      ),
    );
    if (hasStopButton) {
      return true;
    }

    const container = getInputContainer();
    if (container) {
      const stopInContainer = Array.from(
        container.querySelectorAll('button, div[role="button"]'),
      ).some((btn) => isVisible(btn) && isButtonInStopState(btn));
      if (stopInContainer) {
        return true;
      }
    }

    const streamingElement = document.querySelector(
      '[data-streaming="true"], .streaming, [class*="streaming"]',
    );
    if (streamingElement && isVisible(streamingElement)) {
      return true;
    }

    return false;
  }

  const SUBMIT_BUTTON_SELECTOR = [
    'button[data-testid="send-button"]',
    'button[data-testid*="send"]',
    'button[data-testid*="submit"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="发送"]',
    'button[aria-label*="Submit"]',
    'button[aria-label*="提交"]',
    'form button[type="submit"]',
    'button[type="submit"]',
    '.query-bar button[type="submit"]',
  ].join(", ");

  function findSendButton() {
    const container = getInputContainer() || document;

    for (const button of container.querySelectorAll(SUBMIT_BUTTON_SELECTOR)) {
      if (
        isVisible(button) &&
        !button.disabled &&
        !button.classList.contains("pointer-events-none") &&
        button.getAttribute("aria-disabled") !== "true" &&
        button.getAttribute("data-disabled") !== "true" &&
        !isButtonInStopState(button) &&
        !isAccessoryButton(button)
      ) {
        return button;
      }
    }

    // Positional fallback: find the primary action button in the composer
    const allButtons = container.querySelectorAll('button, div[role="button"]');
    for (const button of allButtons) {
      if (
        isVisible(button) &&
        !button.disabled &&
        button.getAttribute("aria-disabled") !== "true" &&
        button.getAttribute("data-disabled") !== "true" &&
        !button.classList.contains("pointer-events-none") &&
        !isAccessoryButton(button) &&
        !isButtonInStopState(button)
      ) {
        return button;
      }
    }

    return null;
  }

  function getAssistantMessages() {
    const selectors = [
      '[data-testid="assistant-message"]',
      '[role="article"][aria-label="Grok"]',
      '[role="article"][aria-label*="Grok"]',
    ];

    const elements = [];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const target = el.closest('[data-testid="assistant-message"]') || el;
        if (!elements.includes(target)) {
          elements.push(target);
        }
      }
    }

    return elements;
  }

  function getUserMessages() {
    const selectors = [
      '[data-testid="user-message"]',
      '[role="article"][aria-label="You"]',
      '[role="article"][aria-label="你"]',
    ];

    const elements = [];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const target = el.closest('[data-testid="user-message"]') || el;
        if (!elements.includes(target)) {
          elements.push(target);
        }
      }
    }

    return elements;
  }

  function getAssistantFromNode(node) {
    if (!node) return null;
    return (
      node.closest('[data-testid="assistant-message"]') ||
      node.closest('[role="article"][aria-label="Grok"]') ||
      node.closest('[role="article"][aria-label*="Grok"]') ||
      null
    );
  }

  function getCardMountPoint(assistantEl) {
    return assistantEl.closest('div[id^="response-"]') || assistantEl;
  }

  function getCollapseTarget(assistantEl) {
    return assistantEl.closest('div[id^="response-"]') || assistantEl;
  }

  function getPromptCollapseTarget(assistantEl) {
    const userMessages = getUserMessages();
    for (let index = userMessages.length - 1; index >= 0; index -= 1) {
      const userMessage = userMessages[index];
      const relation = userMessage.compareDocumentPosition(assistantEl);
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
        return (
          userMessage.closest('div[id^="response-"]') ||
          userMessage.closest('[data-scroll-anchor-root="true"]') ||
          userMessage
        );
      }
    }
    return null;
  }

  function hasResponseActions(el) {
    const turnContainer =
      el?.closest('div[id^="response-"]') ||
      el?.closest('[data-scroll-anchor-root="true"]') ||
      el?.parentElement ||
      el;

    if (!turnContainer) {
      return false;
    }

    const actionButtons = turnContainer.querySelectorAll(
      'button, div[role="button"]',
    );
    return Array.from(actionButtons).some((button) => {
      if (
        button.closest("pre, code") ||
        button.closest(`[${CARD_ATTRIBUTE}]`)
      ) {
        return false;
      }

      const label = (
        button.getAttribute("aria-label") ||
        button.getAttribute("title") ||
        getElementText(button)
      )
        .trim()
        .toLowerCase();

      if (label) {
        const actionKeywords = [
          "copy response",
          "copy",
          "regenerate",
          "like",
          "dislike",
          "share",
          "more actions",
          "复制回复",
          "复制",
          "重新生成",
          "赞",
          "踩",
          "共享",
          "创建共享链接",
          "更多操作",
        ];
        if (actionKeywords.some((kw) => label.includes(kw))) {
          return true;
        }
      }

      return false;
    });
  }

  function extractMessageText(el) {
    if (!el) {
      return "";
    }

    const mainContent =
      el.querySelector(
        ".response-content-markdown, .streamdown-chat-md, .markdown, [class*='markdown']",
      ) || el;

    const clone = mainContent.cloneNode(true);
    clone
      .querySelectorAll(`[${CARD_ATTRIBUTE}]`)
      .forEach((node) => node.remove());

    const noiseSelectors = [
      ".thinking-container",
      '[class*="thinking"]',
      '[data-testid="canvas-trigger"]',
      'button[aria-label*="思考"]',
      'button[aria-label*="Thought"]',
      'button[aria-label*="thought"]',
      'button[aria-label*="Thinking"]',
      'button[aria-label*="工作"]',
      ".thought",
      '[class*="thought"]',
      '[class*="reasoning"]',
      "details",
      "a.citation",
      ".citation",
      '[class*="citation"]',
      'div[aria-label*="sources"]',
      'div[aria-label*="来源"]',
      ".inline-media-container",
      ".action-buttons",
      '[class*="action-buttons"]',
      'button[aria-label="Copy response"]',
      'button[aria-label="Regenerate"]',
      'button[aria-label="Edit"]',
      ".no-copy",
      "figcaption",
      'button[aria-label*="copy"]',
      'button[aria-label*="复制"]',
    ];

    for (const selector of noiseSelectors) {
      const nodes = clone.querySelectorAll(selector);
      nodes.forEach((node) => node.remove());
    }

    const longestCodeText = getLongestCodeText(clone, "pre code, pre");
    if (longestCodeText.length > 10 && !isThinkingOnlyText(longestCodeText)) {
      return longestCodeText;
    }

    const markdownContainers = clone.querySelectorAll(
      ".streamdown-chat-md, .response-content-markdown, .markdown, [class*='markdown']",
    );
    if (markdownContainers.length > 0) {
      const targetContainer = markdownContainers[markdownContainers.length - 1];
      const text = (
        targetContainer.innerText ||
        targetContainer.textContent ||
        ""
      ).trim();
      if (text.length > 10 && !isThinkingOnlyText(text)) {
        return text;
      }
    }

    const directText = (clone.innerText || clone.textContent || "").trim();
    if (isThinkingOnlyText(directText)) {
      return "";
    }

    return directText;
  }

  function createEnterEvent(type) {
    const event = new KeyboardEvent(type, {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
    });
    for (const prop of ["keyCode", "which", "charCode"]) {
      try {
        Object.defineProperty(event, prop, { get: () => 13 });
      } catch (err) {
        // Non-configurable in this engine; key/code are enough.
      }
    }
    return event;
  }

  function clickSendButton(sendButton) {
    const mouseOpts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: 1,
    };
    sendButton.dispatchEvent(new PointerEvent("pointerdown", mouseOpts));
    sendButton.dispatchEvent(new MouseEvent("mousedown", mouseOpts));
    sendButton.dispatchEvent(
      new PointerEvent("pointerup", { ...mouseOpts, buttons: 0 }),
    );
    sendButton.dispatchEvent(
      new MouseEvent("mouseup", { ...mouseOpts, buttons: 0 }),
    );
    sendButton.click();
  }

  function pressEnter(editor) {
    editor.focus();
    editor.dispatchEvent(createEnterEvent("keydown"));
    editor.dispatchEvent(createEnterEvent("keypress"));
    editor.dispatchEvent(createEnterEvent("keyup"));
  }

  async function triggerSend(sendButton, editor) {
    if (sendButton) {
      clickSendButton(sendButton);
      return;
    }

    if (editor) {
      pressEnter(editor);
    }
  }

  function isRecoverableProtocolContent(content) {
    const normalized = String(content || "").trim();
    return (
      normalized.startsWith(MEMORY_PROTOCOL_MARKER) &&
      Boolean(extractProtocolFilename(normalized)) &&
      Boolean(stripProtocolMarker(normalized))
    );
  }

  function getConversationTitle() {
    const title = document.title.replace(/\s*[-–—]\s*Grok\s*$/i, "").trim();

    return title || "chat-memory";
  }

  globalThis.ChatDistiller.registerAdapter({
    siteId: "grok",

    protocolBlockSelector:
      "pre code, pre, .response-content-markdown, .streamdown-chat-md, .markdown",

    sendButtonSettleMs: 150,

    // Input & Send
    findPromptEditor,
    findSendButton,
    triggerSend,

    // Message list & positioning
    getAssistantMessages,
    getUserMessages,
    getAssistantFromNode,
    getCardMountPoint,
    getCollapseTarget,
    getPromptCollapseTarget,

    // State signals
    isGenerationActive,
    hasResponseActions,

    // Content extraction
    extractMessageText,
    isRecoverableProtocolContent,
    getConversationTitle,
  });
})();
