(() => {
  // Perplexity Site Adapter — Perplexity-specific DOM selectors and site behavior.
  // Registered as globalThis.ChatDistiller.adapter for the core engine to consume.

  const { getElementText, getLongestCodeText, isVisible, sleep } = globalThis.ChatDistiller.dom;
  const { isThinkingOnlyText, editorContainsPrompt, selectAllEditorContent } =
    globalThis.ChatDistiller.editor;
  const { CARD_ATTRIBUTE } = globalThis.ChatDistiller.cardUi;
  const {
    MEMORY_PROTOCOL_MARKER,
    extractProtocolFilename,
    stripProtocolMarker,
  } = globalThis.ChatDistiller.protocol;

  function findPromptEditor() {
    const selectors = [
      "textarea#ask-input",
      'div[contenteditable="true"]#ask-input',
      '#ask-input[contenteditable="true"]',
      'div[data-lexical-editor="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="follow-up"]',
      'textarea[aria-placeholder*="Ask"]',
      "div#ask-input",
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

  const SUBMIT_BUTTON_SELECTOR =
    'button[aria-label="Submit"], button[aria-label*="Submit"], ' +
    'button[aria-label*="Send"], button[aria-label*="发送"], ' +
    'button[data-testid*="submit"], button[data-testid*="send"], ' +
    'button[type="submit"], button.bg-button-bg';

  // Perplexity has no <form> around the composer, and the submit button is a
  // sibling of an ancestor of the editor. Climb until an ancestor covers both.
  function getInputContainer() {
    const editor = findPromptEditor();
    if (!editor) return null;

    const form = editor.closest("form");
    if (form) return form;

    let node = editor.parentElement;
    for (let depth = 0; node && depth < 8; depth += 1) {
      if (node.querySelector(SUBMIT_BUTTON_SELECTOR)) {
        return node;
      }
      node = node.parentElement;
    }

    return editor.parentElement;
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

    const rect = button.querySelector("svg rect");
    if (rect) {
      const w = parseFloat(rect.getAttribute("width") || "0");
      const h = parseFloat(rect.getAttribute("height") || "0");
      if (w >= 4 && h >= 4) {
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

    const stopSelectors = [
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止"]',
      'button[aria-label*="中断"]',
      'button[aria-label*="Cancel"]',
      '[aria-label*="Stop generating"]',
      '[aria-label*="停止生成"]',
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

    return false;
  }

  function findSendButton() {
    const container = getInputContainer() || document;

    for (const button of container.querySelectorAll(SUBMIT_BUTTON_SELECTOR)) {
      if (
        isVisible(button) &&
        !button.disabled &&
        !button.classList.contains("pointer-events-none") &&
        button.getAttribute("aria-disabled") !== "true" &&
        button.getAttribute("data-disabled") !== "true" &&
        !isButtonInStopState(button)
      ) {
        return button;
      }
    }

    return null;
  }

  function isUserMessageElement(el) {
    if (!el) return false;
    return (
      el.classList.contains("group/query") ||
      (el.className && String(el.className).includes("group/query")) ||
      Boolean(el.querySelector('button[aria-label="Copy query"]')) ||
      Boolean(el.querySelector('button[aria-label="Edit query"]'))
    );
  }

  function getUserMessages() {
    const selectors = [
      'div[class*="group/query"]',
      "div.group\\/query",
      '[role="heading"][aria-level="1"]',
    ];

    const elements = [];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (isUserMessageElement(el) || el.closest('[class*="group/query"]')) {
          const target = el.closest('[class*="group/query"]') || el;
          if (!elements.includes(target)) {
            const text = getElementText(target).trim();
            if (text.length > 0) {
              elements.push(target);
            }
          }
        }
      }
    }

    if (elements.length === 0) {
      const copyQueryButtons = document.querySelectorAll(
        'button[aria-label="Copy query"]',
      );
      for (const btn of copyQueryButtons) {
        const turn =
          btn.closest(".group\\/title")?.parentElement || btn.parentElement;
        if (turn && !elements.includes(turn)) {
          elements.push(turn);
        }
      }
    }

    return elements;
  }

  function getAssistantMessages() {
    const selectors = [
      'div[id^="markdown-content-"]',
      'div.prose[data-renderer="lm"]',
      "div.prose",
    ];

    const elements = [];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (isUserMessageElement(el)) {
          continue;
        }
        // Identify the assistant message container
        const turnContainer =
          el.closest(".gap-y-2") ||
          el.closest('[class*="gap-y"]') ||
          el.closest('div[dir="auto"]') ||
          el;

        if (!elements.includes(turnContainer)) {
          elements.push(turnContainer);
        }
      }
    }

    return elements;
  }

  function getAssistantFromNode(node) {
    if (!node) return null;
    const markdownContainer =
      node.closest('div[id^="markdown-content-"]') ||
      node.closest('div.prose[data-renderer="lm"]') ||
      node.closest("div.prose");

    if (markdownContainer) {
      return (
        markdownContainer.closest(".gap-y-2") ||
        markdownContainer.closest('[class*="gap-y"]') ||
        markdownContainer.closest('div[dir="auto"]') ||
        markdownContainer
      );
    }

    return null;
  }

  function hasResponseActions(el) {
    const turnContainer =
      el?.closest(".gap-y-2") ||
      el?.closest('[class*="gap-y"]') ||
      el?.closest('div[dir="auto"]') ||
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
          "copy",
          "share",
          "rewrite",
          "helpful",
          "not helpful",
          "download",
          "more actions",
          "复制",
          "分享",
          "重写",
          "重新生成",
        ];
        // Exclude copy query and copy code buttons from marking response completion
        if (
          label === "copy query" ||
          label === "edit query" ||
          label === "copy code"
        ) {
          return false;
        }
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

    // Perplexity renders the streaming/last turn into a div.prose while leaving
    // an empty markdown-content-* container as a sibling, so pick by content
    // rather than by selector order or the answer reads as empty.
    const mainContent =
      [
        'div[id^="markdown-content-"]',
        'div.prose[data-renderer="lm"]',
        "div.prose",
      ]
        .flatMap((selector) => Array.from(el.querySelectorAll(selector)))
        .find((node) => getElementText(node).trim().length > 0) || el;

    const clone = mainContent.cloneNode(true);
    clone
      .querySelectorAll(`[${CARD_ATTRIBUTE}]`)
      .forEach((node) => node.remove());

    const noiseSelectors = [
      "span.citation",
      ".citation",
      '[class*="Citation"]',
      '[data-state="closed"]',
      '[data-state="open"]',
      'button[aria-label*="source"]',
      'button[aria-label="Copy code"]',
      'button[aria-label="Copy query"]',
      'button[aria-label="Edit query"]',
      ".group\\/title",
      '[class*="group/title"]',
      '[class*="message-action-bar"]',
      ".thought",
      '[class*="thought"]',
      '[class*="reasoning"]',
      "details",
      // Code block toolbar; its language label would prefix the extracted text.
      "figcaption",
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
      'div[id^="markdown-content-"], .prose, .markdown, [class*="markdown"]',
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

  async function waitForPrompt(editor, text, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (editorContainsPrompt(editor, text)) return true;
      await sleep(50);
    }
    return editorContainsPrompt(editor, text);
  }

  // Lexical commits edits through React state, so the DOM does not reflect an
  // insertion synchronously. Each mechanism is therefore tried on its own and
  // awaited before falling back, otherwise two of them both land and the prompt
  // is inserted twice. Re-selecting existing content makes a retry replace it.
  async function insertPrompt(editor, text) {
    if (editor instanceof HTMLTextAreaElement) {
      return globalThis.ChatDistiller.editor.insertPrompt(editor, text);
    }

    if (!editor.isContentEditable) {
      return false;
    }

    const attempts = [
      () => {
        // text/plain only: Lexical prefers text/html when both are present, and
        // the HTML parser would swallow the protocol's <!-- ... --> markers as
        // comment nodes, silently stripping them from the prompt.
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        editor.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            composed: true,
            clipboardData: dt,
          }),
        );
      },
      () => {
        document.execCommand("insertText", false, text);
      },
      () => {
        editor.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            composed: true,
            inputType: "insertText",
            data: text,
          }),
        );
        editor.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            composed: true,
            inputType: "insertText",
            data: text,
          }),
        );
      },
    ];

    for (const attempt of attempts) {
      editor.focus();
      selectAllEditorContent(editor);

      try {
        attempt();
      } catch (err) {
        console.warn("Lexical prompt insertion attempt failed", err);
        continue;
      }

      if (await waitForPrompt(editor, text, 600)) {
        return true;
      }
    }

    return editorContainsPrompt(editor, text);
  }

  function editorHasText(editor) {
    const value =
      editor instanceof HTMLTextAreaElement
        ? editor.value
        : editor.innerText || editor.textContent || "";
    return value.trim().length > 0;
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
    // keyCode/which are readonly getters the constructor ignores, but handlers
    // that predate KeyboardEvent.key still read them.
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
    // Collapse the selection to the end; Lexical ignores Enter while the whole
    // paragraph is still selected from insertion.
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    editor.dispatchEvent(createEnterEvent("keydown"));
    editor.dispatchEvent(createEnterEvent("keypress"));
    editor.dispatchEvent(createEnterEvent("keyup"));
  }

  async function sendLanded(editor, timeoutMs, initialUrl) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      // Perplexity may navigate or replace the composer before its generation
      // controls appear. The detached editor still contains the submitted text,
      // so treating it as active would trigger a redundant Enter fallback.
      if (location.href !== initialUrl) return true;
      if (!editor || !editor.isConnected || !editorHasText(editor)) return true;
      if (isGenerationActive()) return true;
      await sleep(100);
    }
    return false;
  }

  async function triggerSend(sendButton, editor) {
    if (sendButton) {
      const initialUrl = location.href;
      clickSendButton(sendButton);
      if (await sendLanded(editor, 1_200, initialUrl)) return;
      console.warn(
        "Chat Distiller: submit button click did not send, trying Enter",
      );
    }

    if (editor) {
      const initialUrl = location.href;
      pressEnter(editor);
      if (await sendLanded(editor, 1_200, initialUrl)) return;
      console.warn("Chat Distiller: Enter key did not send either");
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
    const title = document.title
      .replace(/\s*[-–—]\s*Perplexity\s*(?:AI)?\s*$/i, "")
      .trim();

    return title || "chat-memory";
  }

  globalThis.ChatDistiller.registerAdapter({
    siteId: "perplexity",

    protocolBlockSelector:
      'div[id^="markdown-content-"] pre code, ' +
      'div[id^="markdown-content-"] pre, ' +
      "div.prose pre code, " +
      "div.prose pre, " +
      "pre code, " +
      "pre, " +
      "div.prose",

    // React re-enables the submit button a tick after the editor content lands.
    sendButtonSettleMs: 150,

    // Input & Send
    findPromptEditor,
    findSendButton,
    insertPrompt,
    triggerSend,

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
