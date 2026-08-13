(() => {
  // DeepSeek Site Adapter — DeepSeek-specific DOM selectors and site behavior.
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
      'textarea[placeholder="Message DeepSeek"]',
      'textarea[placeholder*="Message DeepSeek"]',
      'textarea[placeholder*="发送消息"]',
      "textarea#chat-input",
      "main textarea",
      "form textarea",
      "textarea",
      'div[contenteditable="true"]',
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (isVisible(element) && !element.closest('[aria-hidden="true"]')) {
          return element;
        }
      }
    }

    return null;
  }

  function getInputContainer() {
    const editor = findPromptEditor();
    if (!editor) return null;

    let current = editor.parentElement;
    while (current && current !== document.body) {
      if (
        current.querySelector(
          'div[role="button"].ds-button--primary, button.ds-button--primary',
        )
      ) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  function isButtonInStopState(button) {
    if (!button) return false;

    const label = (
      button.getAttribute("aria-label") ||
      button.getAttribute("title") ||
      ""
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
    const container = getInputContainer();
    if (container) {
      const primaryBtn = container.querySelector(
        'div[role="button"].ds-button--primary, button.ds-button--primary',
      );
      if (
        primaryBtn &&
        isVisible(primaryBtn) &&
        isButtonInStopState(primaryBtn)
      ) {
        return true;
      }
    }

    const stopSelectors = [
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止"]',
      'button[aria-label*="中断"]',
      ".ds-icon-stop",
      '[data-testid="stop-button"]',
    ];

    return stopSelectors.some((selector) =>
      Array.from(document.querySelectorAll(selector)).some(isVisible),
    );
  }

  function findSendButton() {
    const container = getInputContainer();
    if (!container) return null;

    const selectors = [
      'div[role="button"].ds-button--primary',
      "button.ds-button--primary",
      'div[role="button"][class*="ds-button--primary"]',
      'div[role="button"][class*="ds-button--circle"]',
      'form button[type="submit"]',
    ];

    for (const selector of selectors) {
      for (const button of container.querySelectorAll(selector)) {
        if (
          isVisible(button) &&
          !button.classList.contains("ds-button--disabled") &&
          button.getAttribute("aria-disabled") !== "true" &&
          !isButtonInStopState(button)
        ) {
          return button;
        }
      }
    }

    return null;
  }

  function getAssistantMessages() {
    const messages = document.querySelectorAll(".ds-message");
    const elements = [];
    for (const msg of messages) {
      if (msg.querySelector(".ds-assistant-message-main-content")) {
        elements.push(msg);
      }
    }
    return elements;
  }

  function getUserMessages() {
    const messages = document.querySelectorAll(".ds-message");
    const elements = [];
    for (const msg of messages) {
      const isAssistant =
        Boolean(msg.querySelector(".ds-assistant-message-main-content")) ||
        Boolean(msg.querySelector(".ds-markdown")) ||
        Boolean(msg.querySelector(".ds-toggle-button")) ||
        Boolean(msg.querySelector(".ds-think-content"));

      if (!isAssistant) {
        const text = getElementText(msg).trim();
        if (text.length > 0) {
          elements.push(msg);
        }
      }
    }
    return elements;
  }

  function getAssistantFromNode(node) {
    const msg = node?.closest(".ds-message");
    if (!msg) {
      return null;
    }
    const isAssistant =
      Boolean(msg.querySelector(".ds-assistant-message-main-content")) ||
      Boolean(msg.querySelector(".ds-markdown")) ||
      Boolean(msg.querySelector(".ds-think-content")) ||
      Boolean(msg.querySelector(".ds-toggle-button"));
    if (isAssistant) {
      return msg;
    }
    return null;
  }

  function hasResponseActions(el) {
    const conversationTurn = el?.closest(".ds-message");
    if (!conversationTurn) {
      return false;
    }

    const actionButtons = conversationTurn.querySelectorAll(
      'div[role="button"], button',
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
          "复制",
          "重试",
          "重新生成",
          "赞",
          "踩",
        ];
        if (actionKeywords.some((kw) => label.includes(kw))) {
          return true;
        }
      }

      if (button.classList.contains("ds-button--iconLabelTertiary")) {
        return true;
      }

      return false;
    });
  }

  async function extractMessageText(el) {
    if (!el) {
      return "";
    }

    // Target .ds-assistant-message-main-content specifically to avoid web search / thinking noise
    const mainContent =
      el.querySelector(".ds-assistant-message-main-content") || el;

    const clone = mainContent.cloneNode(true);
    clone
      .querySelectorAll(`[${CARD_ATTRIBUTE}]`)
      .forEach((node) => node.remove());

    const thinkingSelectors = [
      ".ds-think-content",
      '[class*="ds-think"]',
      "details",
    ];
    for (const selector of thinkingSelectors) {
      const nodes = clone.querySelectorAll(selector);
      nodes.forEach((node) => node.remove());
    }

    const codeBlocks = Array.from(clone.querySelectorAll("pre code"));
    if (codeBlocks.length > 0) {
      codeBlocks.sort((a, b) => {
        const lenA = getElementText(a).trim().length;
        const lenB = getElementText(b).trim().length;
        return lenB - lenA;
      });

      const longestCodeText = getElementText(codeBlocks[0]).trim();
      if (longestCodeText.length > 10 && !isThinkingOnlyText(longestCodeText)) {
        return longestCodeText;
      }
    }

    const markdownContainers = clone.querySelectorAll(
      ".ds-markdown, .markdown, [class*='markdown']",
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
    const title = document.title.replace(/\s*[-–—]\s*DeepSeek\s*$/i, "").trim();

    return title || "chat-memory";
  }

  globalThis.ChatDistiller.registerAdapter({
    siteId: "deepseek",

    // DeepSeek may restore historical Markdown with a different DOM shape
    // after a page refresh. Include the Markdown container itself so protocol
    // restoration does not depend only on the transient pre/code structure.
    protocolBlockSelector:
      ".ds-assistant-message-main-content pre code, " +
      ".ds-assistant-message-main-content pre, " +
      ".ds-assistant-message-main-content .ds-markdown",

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
