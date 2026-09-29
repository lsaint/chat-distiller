import assert from "node:assert/strict";
import test from "node:test";

globalThis.ChatDistiller = globalThis.ChatDistiller || {};
globalThis.ChatDistiller.dom = {
  getElementText: () => "",
  getLongestCodeText: () => "",
  isVisible: () => true,
};
globalThis.ChatDistiller.editor = {
  isThinkingOnlyText: () => false,
};
globalThis.ChatDistiller.protocol = {
  MEMORY_PROTOCOL_MARKER: "<!-- chat-distiller:v1 -->",
  extractProtocolFilename: () => null,
  stripProtocolMarker: (t) => t,
};
globalThis.ChatDistiller.cardUi = {
  CARD_ATTRIBUTE: "data-chat-distiller-card",
};

await import("../src/core/adapter-registry.js");

test("adapter registry sets default cardStyles to empty string", () => {
  const { registerAdapter } = globalThis.ChatDistiller;
  const adapter = registerAdapter({ siteId: "test-site" });
  assert.equal(adapter.cardStyles, "");
});

test("Gemini adapter registers cardStyles with content-width constraints", async () => {
  await import("../src/site/gemini.js");
  const adapter = globalThis.ChatDistiller.adapter;
  assert.equal(adapter.siteId, "gemini");
  assert.ok(adapter.cardStyles, "Gemini adapter should have cardStyles defined");
  assert.match(adapter.cardStyles, /model-response > \[data-chat-distiller-card\]/);
  assert.match(adapter.cardStyles, /--bard-chat-window-content-width-default/);
  assert.match(adapter.cardStyles, /@container chat-area \(max-width: 756px\)/);
});

test("card-ui injectCardStyles contains 15% margin for modal preview", async () => {
  let injectedStyles = "";
  globalThis.document = {
    addEventListener: () => {},
    querySelector: () => null,
    createElement: (tag) => ({ tag, setAttribute: () => {}, textContent: "" }),
    documentElement: {
      append: (el) => {
        injectedStyles = el.textContent;
      },
    },
  };
  globalThis.ChatDistillerI18n = { t: (k) => k };
  await import("../src/core/card-ui.js");
  globalThis.ChatDistiller.cardUi.injectCardStyles();
  assert.match(injectedStyles, /dialog\.chat-distiller-modal-preview/);
  assert.match(injectedStyles, /inset:\s*24px\s+15%/);
  assert.match(injectedStyles, /width:\s*calc\(100vw\s*-\s*30%\)/);
});
