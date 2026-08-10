(() => {
  // Shared prompt editor and content inspection utilities.

  const { t } = globalThis.ChatDistillerI18n;
  const { sleep } = globalThis.ChatDistiller.dom;

  function insertPrompt(editor, text) {
    if (editor instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;

      if (setter) {
        setter.call(editor, text);
      } else {
        editor.value = text;
      }

      editor.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: text,
        }),
      );
      editor.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text,
        }),
      );
      editor.dispatchEvent(
        new Event("change", {
          bubbles: true,
        }),
      );
      return editorContainsPrompt(editor, text);
    }

    if (!editor.isContentEditable) {
      return false;
    }

    editor.focus();
    selectAllEditorContent(editor);

    const beforeInputAccepted = editor.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: text,
      }),
    );

    if (beforeInputAccepted) {
      editor.replaceChildren(createEditorParagraph(text));
      editor.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text,
        }),
      );
    }

    if (
      !editorContainsPrompt(editor, text) &&
      document.queryCommandSupported?.("insertText")
    ) {
      selectAllEditorContent(editor);
      try {
        document.execCommand("insertText", false, text);
      } catch (error) {
        console.warn("Fallback insertion failed", error);
      }
    }

    editor.dispatchEvent(
      new Event("change", {
        bubbles: true,
      }),
    );

    return editorContainsPrompt(editor, text);
  }

  function createEditorParagraph(text) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    return paragraph;
  }

  function selectAllEditorContent(editor) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function editorContainsPrompt(editor, prompt) {
    const { normalizeComparableText } = globalThis.ChatDistiller.protocol;
    const current =
      editor instanceof HTMLTextAreaElement
        ? editor.value
        : editor.innerText || editor.textContent || "";

    return normalizeComparableText(current).includes(
      normalizeComparableText(prompt).slice(0, 80),
    );
  }

  async function waitForEditorContent(editor, prompt, timeoutMs) {
    const timeoutAt = Date.now() + timeoutMs;

    while (Date.now() < timeoutAt) {
      if (editorContainsPrompt(editor, prompt)) {
        return;
      }
      await sleep(100);
    }

    throw new Error(t("promptNotAccepted"));
  }

  function isThinkingOnlyText(text) {
    if (!text) return true;
    const trimmed = String(text).trim().toLowerCase();
    if (trimmed.length < 25) {
      if (
        trimmed === "thinking" ||
        trimmed === "thinking..." ||
        trimmed.startsWith("thinking") ||
        trimmed.includes("思考中") ||
        trimmed.includes("已思考") ||
        trimmed === "thought" ||
        trimmed.includes("reasoning")
      ) {
        return true;
      }
    }
    return false;
  }

  globalThis.ChatDistiller = globalThis.ChatDistiller || {};
  globalThis.ChatDistiller.editor = {
    insertPrompt,
    createEditorParagraph,
    selectAllEditorContent,
    editorContainsPrompt,
    waitForEditorContent,
    isThinkingOnlyText,
  };
})();
