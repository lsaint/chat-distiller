(() => {
  // Doubao Site Adapter — Doubao-specific DOM selectors and site behavior.
  // Registered as globalThis.ChatDistiller.adapter for the core engine to consume.

  const { getElementText, getLongestCodeText, isVisible } = globalThis.ChatDistiller.dom;
  const { isThinkingOnlyText } = globalThis.ChatDistiller.editor;
  const { CARD_ATTRIBUTE } = globalThis.ChatDistiller.cardUi;
  const {
    MEMORY_PROTOCOL_MARKER,
    extractProtocolFilename,
    stripProtocolMarker,
  } = globalThis.ChatDistiller.protocol;

  function findPromptEditor() {
    const selectors = [
      "textarea.semi-input-textarea",
      'textarea[placeholder*="发消息"]',
      'textarea[placeholder*="按住空格说话"]',
      "#input-engine-container textarea",
      '[data-guidance-input-boundary="true"] textarea',
      "textarea",
      'div[contenteditable="true"]',
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
      editor.closest("#input-engine-container") ||
      editor.closest('[data-guidance-input-boundary="true"]') ||
      editor.parentElement
    );
  }

  function isButtonInStopState(button) {
    if (!button) return false;

    if (
      button.classList.contains("break-btn-fISNgC") ||
      (button.className && String(button.className).includes("break-btn"))
    ) {
      return true;
    }

    const label = (
      button.getAttribute("aria-label") ||
      button.getAttribute("title") ||
      getElementText(button)
    ).toLowerCase();

    if (
      label.includes("stop") ||
      label.includes("停止") ||
      label.includes("中断")
    ) {
      return true;
    }

    const rect = button.querySelector("svg rect");
    if (rect) {
      const w = parseFloat(rect.getAttribute("width") || "0");
      const h = parseFloat(rect.getAttribute("height") || "0");
      if (w >= 6 && h >= 6) {
        return true;
      }
    }

    return false;
  }

  function isGenerationActive() {
    const streamingElement = document.querySelector('[data-streaming="true"]');
    if (streamingElement && isVisible(streamingElement)) {
      return true;
    }

    const breakButton = document.querySelector(
      '.break-btn-fISNgC, [class*="break-btn"]',
    );
    if (
      breakButton &&
      isVisible(breakButton) &&
      !breakButton.classList.contains("!hidden") &&
      !breakButton.hidden
    ) {
      return true;
    }

    const container = getInputContainer();
    if (container) {
      const stopInContainer = Array.from(
        container.querySelectorAll(
          'button, div[role="button"], [class*="break-btn"]',
        ),
      ).some((btn) => isVisible(btn) && isButtonInStopState(btn));
      if (stopInContainer) {
        return true;
      }
    }

    const stopSelectors = [
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止"]',
      'button[aria-label*="中断"]',
      '[aria-label*="停止生成"]',
      '[aria-label*="停止回答"]',
      '[aria-label*="中断生成"]',
      ".semi-spin",
    ];

    return stopSelectors.some((selector) =>
      Array.from(document.querySelectorAll(selector)).some(isVisible),
    );
  }

  function findSendButton() {
    const container = getInputContainer() || document;
    const selectors = [
      "#flow-end-msg-send",
      "button#flow-end-msg-send",
      ".send-btn-wrapper button",
      ".send-btn-wrapper [data-dbx-name=\"button\"]",
      ".send-btn-wrapper div[role=\"button\"]",
      "#input-engine-container .send-btn-wrapper button",
      "[data-guidance-input-boundary=\"true\"] .send-btn-wrapper button",
      "#input-engine-container button[id*=\"send\"]",
      "[data-guidance-input-boundary=\"true\"] button[id*=\"send\"]",
      "button[id*=\"send\"]",
      "[data-testid=\"send-button\"]",
      "button[data-testid*=\"send\"]",
      "button[class*=\"send-msg-btn\"]",
      "#input-engine-container button[aria-label*=\"发送\"]",
      "[data-guidance-input-boundary=\"true\"] button[aria-label*=\"发送\"]",
      "button[aria-label*=\"发送\"]",
      "button[aria-label*=\"Send\"]",
      "[aria-label*=\"发送\"]",
      "button[data-testid*=\"submit\"]",
      "form button[type=\"submit\"]",
      "button.send-btn",
    ];

    for (const selector of selectors) {
      for (const button of container.querySelectorAll(selector)) {
        if (
          isVisible(button) &&
          !button.disabled &&
          button.getAttribute("aria-disabled") !== "true" &&
          button.getAttribute("data-disabled") !== "true" &&
          !isButtonInStopState(button)
        ) {
          return button;
        }
      }
    }

    return null;
  }

  function isUserMessageElement(msg) {
    if (
      msg.classList.contains("justify-end") ||
      msg.querySelector('[data-foundation-type="send-message-action-bar"]') ||
      msg.querySelector(".bg-g-send-msg-bubble-bg")
    ) {
      return true;
    }
    return false;
  }

  function getAssistantMessages() {
    const messages = document.querySelectorAll("div[data-message-id]");
    const elements = [];
    for (const msg of messages) {
      if (!isUserMessageElement(msg)) {
        elements.push(msg);
      }
    }
    return elements;
  }

  function getUserMessages() {
    const messages = document.querySelectorAll("div[data-message-id]");
    const elements = [];
    for (const msg of messages) {
      if (isUserMessageElement(msg)) {
        const text = getElementText(msg).trim();
        if (text.length > 0) {
          elements.push(msg);
        }
      }
    }
    return elements;
  }

  function getAssistantFromNode(node) {
    const msg = node?.closest("div[data-message-id]");
    if (!msg) {
      return null;
    }
    if (!isUserMessageElement(msg)) {
      return msg;
    }
    return null;
  }

  function hasResponseActions(el) {
    const messageTurn =
      el?.closest("[data-observe-row]") ||
      el?.closest(".v_list_row") ||
      el?.closest('[data-target-id="message-box-target-id"]') ||
      el?.closest("div[data-message-id]") ||
      el;

    if (!messageTurn) {
      return false;
    }

    if (
      messageTurn.querySelector(
        '[data-foundation-type="receive-message-action-bar"]',
      )
    ) {
      return true;
    }

    const actionButtons = messageTurn.querySelectorAll(
      'button, div[role="button"], [data-dbx-name="button"]',
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
          "copy",
          "retry",
          "regenerate",
          "like",
          "dislike",
          "share",
          "复制",
          "重试",
          "重新生成",
          "赞",
          "踩",
          "分享",
          "更多",
        ];
        if (actionKeywords.some((kw) => label.includes(kw))) {
          return true;
        }
      }

      return false;
    });
  }

  async function extractMessageText(el) {
    if (!el) {
      return "";
    }

    const mainContent =
      el.querySelector('[data-plugin-identifier="block_type:10000"]') ||
      el.querySelector(".md-box-root") ||
      el;

    const clone = mainContent.cloneNode(true);
    clone
      .querySelectorAll(`[${CARD_ATTRIBUTE}]`)
      .forEach((node) => node.remove());

    const noiseSelectors = [
      "[data-copy-ignore]",
      '[data-plugin-identifier*="search_query_result_block"]',
      '[data-plugin-identifier*="10025"]',
      '[data-foundation-type="receive-message-action-bar"]',
      '[data-foundation-type="receive-message-suggest-foundation"]',
      '[class*="message-action-bar"]',
      ".thought",
      '[class*="thought"]',
      '[class*="reasoning"]',
      "details",
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
      ".md-box-root, .markdown, [class*='markdown']",
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

  function isRecoverableProtocolContent(content) {
    const normalized = String(content || "").trim();
    return (
      normalized.startsWith(MEMORY_PROTOCOL_MARKER) &&
      Boolean(extractProtocolFilename(normalized)) &&
      Boolean(stripProtocolMarker(normalized))
    );
  }

  function getConversationTitle() {
    const title = document.title
      .replace(/\s*[-–—]\s*豆包\s*$/i, "")
      .replace(/\s*[-–—]\s*Doubao\s*$/i, "")
      .trim();

    return title || "chat-memory";
  }

  globalThis.ChatDistiller.registerAdapter({
    siteId: "doubao",

    protocolBlockSelector:
      ".md-box-root pre code, " +
      ".md-box-root pre, " +
      ".md-box-root, " +
      '[data-plugin-identifier="block_type:10000"] pre code, ' +
      '[data-plugin-identifier="block_type:10000"] pre, ' +
      "pre code, " +
      "pre",

    // Input
    findPromptEditor,
    findSendButton,

    // Message list & positioning
    getAssistantMessages,
    getUserMessages,
    getAssistantFromNode,

    // State signals
    isGenerationActive,
    hasResponseActions,

    // Content extraction
    extractMessageText,
    isRecoverableProtocolContent,
    getConversationTitle,
  });
})();
