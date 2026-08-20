(() => {
  // ChatGPT Site Adapter — all ChatGPT-specific DOM selectors and site behavior.
  // Registered as globalThis.ChatDistiller.adapter for the core engine to consume.

  const { t } = globalThis.ChatDistillerI18n;
  const { getElementText, isVisible, sleep } = globalThis.ChatDistiller.dom;
  const { isThinkingOnlyText } = globalThis.ChatDistiller.editor;
  const { CARD_ATTRIBUTE } = globalThis.ChatDistiller.cardUi;
  const MAX_DOWNLOAD_BYTES = 2_000_000;
  const ALLOWED_DOWNLOAD_TYPES = new Set([
    "application/markdown",
    "text/markdown",
    "text/plain",
  ]);

  function findPromptEditor() {
    const selectors = [
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
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'form button[type="submit"]',
    ];

    for (const selector of selectors) {
      for (const button of document.querySelectorAll(selector)) {
        if (
          button instanceof HTMLButtonElement &&
          isVisible(button) &&
          !button.matches('[data-testid="stop-button"]')
        ) {
          return button;
        }
      }
    }

    return null;
  }

  function getAssistantMessages() {
    const selectors = [
      '[data-message-author-role="assistant"]',
      'article[data-testid^="conversation-turn-"] [data-message-author-role="assistant"]',
    ];

    const elements = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (!elements.includes(element)) {
          elements.push(element);
        }
      }
    }

    return elements;
  }

  function getUserMessages() {
    return Array.from(
      document.querySelectorAll('[data-message-author-role="user"]'),
    );
  }

  function getAssistantFromNode(node) {
    return node.closest('[data-message-author-role="assistant"]');
  }

  function isGenerationActive() {
    const selectors = [
      '[data-testid="stop-button"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止"]',
      'button[aria-label*="Interrupt"]',
      'button[aria-label*="中断"]',
      'button[data-testid*="stop"]',
    ];

    return selectors.some((selector) =>
      Array.from(document.querySelectorAll(selector)).some(isVisible),
    );
  }

  function hasResponseActions(el) {
    const conversationTurn = el?.closest('[data-testid^="conversation-turn-"]');
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
      'button[aria-label="Copy response"]',
      'button[aria-label="Copy answer"]',
      'button[aria-label="复制回复"]',
      'button[aria-label="复制回答"]',
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

    // 5. Look for markdown response container in cleaned content
    const markdownContainers = clone.querySelectorAll(
      ".markdown, [class*='markdown']",
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

    const codeBlocks = Array.from(panel.querySelectorAll("pre code"));
    if (codeBlocks.length > 0) {
      codeBlocks.sort((a, b) => {
        const lenA = getElementText(a).trim().length;
        const lenB = getElementText(b).trim().length;
        return lenB - lenA;
      });
      const codeText = getElementText(codeBlocks[0]).trim();
      if (codeText.length > 20) {
        return codeText;
      }
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
    protocolBlockSelector: "pre code, .cm-content",

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
