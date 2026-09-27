(() => {
  // ChatGPT Site Adapter — all ChatGPT-specific DOM selectors and site behavior.
  // Registered as globalThis.ChatDistiller.adapter for the core engine to consume.

  const { t } = globalThis.ChatDistillerI18n;
  const { getElementText, getLongestCodeText, isVisible, sleep } = globalThis.ChatDistiller.dom;
  const { isThinkingOnlyText } = globalThis.ChatDistiller.editor;
  const { CARD_ATTRIBUTE } = globalThis.ChatDistiller.cardUi;
  const MAX_DOWNLOAD_BYTES = 2_000_000;
  const ALLOWED_DOWNLOAD_TYPES = new Set([
    "application/markdown",
    "text/markdown",
    "text/plain",
  ]);

  const CODE_BLOCK_SELECTOR = [
    "pre code",
    "[data-markdown-copy='code-block'] code",
    "div[class*='CodeBlock'] code",
    ".chatgpt-code-scrollport code",
    "code.whitespace-pre\\!",
    "code[class*='CodeContent']",
  ].join(", ");

  const PROTOCOL_BLOCK_SELECTOR = [
    "pre code",
    "[data-markdown-copy='code-block'] code",
    "div[class*='CodeBlock'] code",
    ".chatgpt-code-scrollport code",
    "code.whitespace-pre\\!",
    "code[class*='CodeContent']",
    ".cm-content",
  ].join(", ");

  function findPromptEditor() {
    const selectors = [
      'form[data-chatgpt-composer] [contenteditable="true"]',
      'div[data-composer-markdown][contenteditable="true"]',
      "#prompt-textarea",
      'div.ProseMirror[contenteditable="true"]',
      '[contenteditable="true"].ProseMirror',
      'div[contenteditable="true"][data-virtualkeyboard="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'main form div[contenteditable="true"]',
      'form div[contenteditable="true"]',
      'textarea[data-id="root"]',
      "main form textarea",
      "textarea",
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

  function findSendButton() {
    const selectors = [
      '[data-testid="send-button"]',
      'button[data-composer-navigation-target="send"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'form[data-chatgpt-composer] button[type="submit"]',
      'form button[type="submit"]',
      'form[data-chatgpt-composer] button[class*="bg-composer-primary"]',
    ];

    for (const selector of selectors) {
      for (const button of document.querySelectorAll(selector)) {
        if (
          button instanceof HTMLButtonElement &&
          isVisible(button) &&
          !button.matches(
            '[data-testid="stop-button"], [data-composer-navigation-target="stop"], button[aria-label*="Stop"], button[aria-label*="停止"], button[aria-label*="Voice"], button[aria-label*="语音"]',
          )
        ) {
          return button;
        }
      }
    }

    return null;
  }

  function getAssistantMessages() {
    const legacy = document.querySelectorAll(
      '[data-message-author-role="assistant"], article[data-testid^="conversation-turn-"] [data-message-author-role="assistant"]',
    );
    if (legacy.length > 0) {
      return Array.from(new Set(legacy));
    }

    const searchUnits = document.querySelectorAll(
      '[data-chatgpt-search-unit-key*="assistant"]',
    );
    if (searchUnits.length > 0) {
      return Array.from(searchUnits);
    }

    const contentUnits = document.querySelectorAll(
      '[data-content-search-unit-key*="assistant"]',
    );
    if (contentUnits.length > 0) {
      return Array.from(contentUnits);
    }

    const roles = Array.from(
      document.querySelectorAll('[data-conversation-role="assistant"]'),
    ).map((h) => h.closest('[data-turn-key]') || h.parentElement);
    return Array.from(new Set(roles.filter(Boolean)));
  }

  function getUserMessages() {
    const legacy = document.querySelectorAll(
      '[data-message-author-role="user"]',
    );
    if (legacy.length > 0) {
      return Array.from(legacy);
    }

    const searchUnits = document.querySelectorAll(
      '[data-chatgpt-search-unit-key*="user"]',
    );
    if (searchUnits.length > 0) {
      return Array.from(searchUnits);
    }

    const contentUnits = document.querySelectorAll(
      '[data-content-search-unit-key*="user"]',
    );
    if (contentUnits.length > 0) {
      return Array.from(contentUnits);
    }

    return Array.from(
      document.querySelectorAll('[data-user-message-bubble="true"]'),
    );
  }

  function getAssistantFromNode(node) {
    if (!node) return null;
    return (
      node.closest(
        '[data-message-author-role="assistant"], [data-chatgpt-search-unit-key*="assistant"], [data-content-search-unit-key*="assistant"]',
      ) ||
      node
        .closest('[data-turn-key], [data-content-search-turn-key]')
        ?.querySelector(
          '[data-message-author-role="assistant"], [data-chatgpt-search-unit-key*="assistant"], [data-content-search-unit-key*="assistant"]',
        ) ||
      null
    );
  }

  function getCardMountPoint(assistantEl) {
    let p = assistantEl.parentElement;
    while (
      p &&
      !p.querySelector(".turn-action-controls") &&
      p !== document.body
    ) {
      p = p.parentElement;
    }
    return p || assistantEl;
  }

  function getCollapseTarget(assistantEl) {
    let p = assistantEl.parentElement;
    while (
      p &&
      !p.querySelector(".turn-action-controls") &&
      p !== document.body
    ) {
      p = p.parentElement;
    }
    return p || assistantEl;
  }

  const STOP_BUTTON_SELECTOR = [
    '[data-testid="stop-button"]',
    '[data-composer-navigation-target="stop"]',
    'form[data-chatgpt-composer] button[aria-label*="Stop"]',
    'form[data-chatgpt-composer] button[aria-label*="停止"]',
    'button[aria-label*="Stop"]',
    'button[aria-label*="停止"]',
    'button[aria-label*="Interrupt"]',
    'button[aria-label*="中断"]',
    'button[data-testid*="stop"]',
  ].join(", ");

  function isGenerationActive() {
    const buttons = document.querySelectorAll(STOP_BUTTON_SELECTOR);
    for (let i = 0; i < buttons.length; i += 1) {
      if (isVisible(buttons[i])) {
        return true;
      }
    }
    return false;
  }

  function hasResponseActions(el) {
    const conversationTurn =
      el?.closest(
        '[data-turn-key], [data-content-search-turn-key], article[data-testid^="conversation-turn-"], [data-testid^="conversation-turn-"]',
      ) || el;
    if (!conversationTurn) {
      return false;
    }

    if (conversationTurn.querySelector('[aria-label="Response actions"]')) {
      return true;
    }

    const finalActionSelectors = [
      'button[data-testid="copy-turn-action-button"]',
      'button[data-testid*="regenerate"]',
      'button[data-testid*="retry"]',
      'button[aria-label="Regenerate response"]',
      'button[aria-label*="Regenerate"]',
      'button[aria-label*="重新生成"]',
      'button[aria-label="Copy response"]',
      'button[aria-label="Copy answer"]',
      'button[aria-label="复制回复"]',
      'button[aria-label="复制回答"]',
      '.turn-action-controls button[aria-label*="Regenerate"]',
      '.turn-action-controls button[aria-label*="重新生成"]',
    ];
    if (
      finalActionSelectors.some((selector) =>
        conversationTurn.querySelector(selector),
      )
    ) {
      return true;
    }

    const completionLabels = new Set([
      "try again",
      "retry",
      "regenerate",
      "regenerate response",
      "重新生成",
      "重试",
    ]);
    return Array.from(conversationTurn.querySelectorAll("button")).some(
      (button) => {
        if (
          button.closest(
            "pre, code, [data-markdown-copy='code-block'], div[class*='CodeBlock']",
          ) ||
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
        return completionLabels.has(label);
      },
    );
  }

  async function extractMessageText(el) {
    if (!el) {
      return "";
    }

    // 1. Check for downloadable file link or attachment
    const downloadLink = el.querySelector(
      'a[download], a[href*="/files/"], a[href*="sandbox:"], a[href*="backend-api/files"], [data-testid*="download"] a',
    );
    if (downloadLink && isAllowedDownloadUrl(downloadLink.href)) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(downloadLink.href, {
          signal: controller.signal,
        });
        if (
          response.ok &&
          isAllowedDownloadType(response.headers.get("content-type"))
        ) {
          const fileContent = await readLimitedResponseText(
            response,
            MAX_DOWNLOAD_BYTES,
          );
          if (
            fileContent &&
            fileContent.trim() &&
            !isThinkingOnlyText(fileContent)
          ) {
            return fileContent.trim();
          }
        }
      } catch (error) {
        console.warn("Failed to fetch downloadable file content:", error);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // 2. Check for Canvas / File entity button
    const fileBtn = el.querySelector(
      'button.behavior-btn, button[class*="behavior-btn"], button[aria-label*=".md"], button[aria-label*="file"], button[aria-label*="Markdown"]',
    );
    if (fileBtn) {
      let canvasPanel = findCanvasPanel();
      if (!canvasPanel) {
        try {
          fileBtn.click();
          await sleep(1500);
          canvasPanel = findCanvasPanel();
        } catch (err) {
          console.warn("Clicking file button failed:", err);
        }
      }

      if (canvasPanel) {
        const canvasText = extractCanvasContent(canvasPanel);
        if (
          canvasText &&
          canvasText.trim().length > 20 &&
          !isThinkingOnlyText(canvasText)
        ) {
          return canvasText.trim();
        }
      }
    }

    // 3. Clone element to manipulate DOM safely without modifying the page
    const clone = el.cloneNode(true);
    clone
      .querySelectorAll(`[${CARD_ATTRIBUTE}]`)
      .forEach((node) => node.remove());

    // Remove thinking and reasoning process elements
    const thinkingSelectors = [
      '[data-testid*="thought"]',
      '[data-testid*="reasoning"]',
      ".thought",
      '[class*="thought"]',
      '[class*="reasoning"]',
      "details",
      'button[aria-label*="Thought"]',
      'button[aria-label*="思考"]',
      'button[aria-label*="Thinking"]',
    ];
    for (const selector of thinkingSelectors) {
      const nodes = clone.querySelectorAll(selector);
      nodes.forEach((node) => node.remove());
    }

    // 4. Look for Markdown code blocks inside the cleaned message, select longest
    const longestCodeText = getLongestCodeText(clone, CODE_BLOCK_SELECTOR);
    if (longestCodeText.length > 10 && !isThinkingOnlyText(longestCodeText)) {
      return longestCodeText;
    }

    // 5. Look for markdown response container in cleaned content
    const markdownContainers = clone.querySelectorAll(
      ".markdown, [class*='markdown'], [class*='MarkdownRoot'], [data-markdown-text-style='assistant-message']",
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

    // If text is just a filename button without markdown body, discard it
    if (
      directText.length < 120 &&
      (directText.endsWith(".md") ||
        directText.includes(".md ") ||
        directText.match(/^[a-z0-9_-]+\.md$/i))
    ) {
      if (!directText.includes("\n") && !directText.includes("#")) {
        return "";
      }
    }

    return directText;
  }

  function isAllowedDownloadUrl(href) {
    try {
      const url = new URL(href, location.href);
      const isKnownFilePath =
        url.pathname.includes("/files/") ||
        url.pathname.includes("/backend-api/files/");
      return (
        url.protocol === "https:" &&
        url.origin === location.origin &&
        isKnownFilePath
      );
    } catch {
      return false;
    }
  }

  function isAllowedDownloadType(contentType) {
    const mediaType = String(contentType || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    return ALLOWED_DOWNLOAD_TYPES.has(mediaType);
  }

  async function readLimitedResponseText(response, maxBytes) {
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error("Download exceeds the allowed size.");
    }
    if (!response.body) {
      return "";
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let text = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          return text + decoder.decode();
        }
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          throw new Error("Download exceeds the allowed size.");
        }
        text += decoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  function findCanvasPanel() {
    const canvasSelectors = [
      "aside",
      '[role="complementary"]',
      '[data-testid*="canvas"]',
      '[data-testid*="artifact"]',
      '[data-testid*="document"]',
      'div[class*="canvas-"]',
      'div[class*="canvas_"]',
      'div[class*="Canvas"]',
      'div[class*="side-panel"]',
      'div[class*="sidebar"]',
      "[data-canvas-document-id]",
      ".monaco-editor",
      'div.ProseMirror[contenteditable="true"]:not(#prompt-textarea)',
    ];

    for (const selector of canvasSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (el && isVisible(el)) {
          if (!el.querySelector('[data-message-author-role="user"]')) {
            return el;
          }
        }
      }
    }

    return null;
  }

  function extractCanvasContent(panel) {
    if (!panel) return "";

    const longestCodeText = getLongestCodeText(panel, CODE_BLOCK_SELECTOR);
    if (longestCodeText.length > 20) {
      return longestCodeText;
    }

    const editor =
      panel.querySelector(".monaco-editor") ||
      panel.querySelector('[contenteditable="true"]') ||
      panel.querySelector(".markdown") ||
      panel.querySelector('[class*="markdown"]') ||
      panel;

    return (editor.innerText || editor.textContent || "").trim();
  }

  function getConversationTitle() {
    const title = document.title.replace(/\s*[-–—]\s*ChatGPT\s*$/i, "").trim();

    return title || "chat-memory";
  }

  globalThis.ChatDistiller.registerAdapter({
    siteId: "chatgpt",
    protocolBlockSelector: PROTOCOL_BLOCK_SELECTOR,

    // Turn positioning hooks
    getCardMountPoint,
    getCollapseTarget,

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
    getConversationTitle,
  });
})();
