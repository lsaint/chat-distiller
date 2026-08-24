import assert from "node:assert/strict";
import test from "node:test";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "en" },
});
await import("../prompt-constants.js");
await import("../i18n.js");

const { appendOutputProtocol } = await import("../extraction-client.js");
const { getDefaultPrompt, getOutputProtocolSuffix } =
  globalThis.ChatDistillerI18n;

test("default prompts contain content instructions but no output protocol", () => {
  for (const locale of ["en", "zh_CN"]) {
    const prompt = getDefaultPrompt(locale);
    assert.doesNotMatch(prompt, /chat-distiller:v1/);
    assert.doesNotMatch(prompt, /four backticks|四个反引号/);
  }
});

test("the internal output protocol is always appended", () => {
  const customPrompt = `Write a checklist.
<!-- chat-distiller:v1 -->
<!-- filename: topic-name.md -->
<!-- /chat-distiller:v1 -->
Do not add update_time or Canvas.`;
  const result = appendOutputProtocol(customPrompt);

  assert.equal(result, `${customPrompt}\n\n${getOutputProtocolSuffix()}`);
  assert.equal(result.match(/highest priority/g)?.length, 1);
});

test("prompt whitespace is normalized before appending the protocol", () => {
  assert.equal(
    appendOutputProtocol("  Write a short note.  \n"),
    `Write a short note.\n\n${getOutputProtocolSuffix()}`,
  );
});
