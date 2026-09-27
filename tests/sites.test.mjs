import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPPORTED_SITES,
  getConversationId,
  getSiteForUrl,
  getSiteIdForUrl,
  isSupportedChatUrl,
} from "../sites.js";

test("supported sites contains Grok", () => {
  const grok = SUPPORTED_SITES.find((s) => s.siteId === "grok");
  assert.ok(grok, "Grok should be registered in SUPPORTED_SITES");
  assert.equal(grok.displayName, "Grok");
  assert.deepEqual(grok.origins, ["https://grok.com/"]);
});

test("identifies Grok URLs correctly", () => {
  const grokChatUrl =
    "https://grok.com/c/1a2f2cb3-5936-4249-b2ae-f524439bfdd8?rid=94a905b0-5d22-4d82-be26-2cfe1e00eab1";
  assert.equal(isSupportedChatUrl(grokChatUrl), true);
  assert.equal(getSiteIdForUrl(grokChatUrl), "grok");

  const site = getSiteForUrl(grokChatUrl);
  assert.equal(site?.siteId, "grok");
});

test("extracts Grok conversationId correctly", () => {
  const url1 =
    "https://grok.com/c/1a2f2cb3-5936-4249-b2ae-f524439bfdd8?rid=94a905b0-5d22-4d82-be26-2cfe1e00eab1";
  assert.deepEqual(getConversationId(url1), {
    siteId: "grok",
    conversationId: "1a2f2cb3-5936-4249-b2ae-f524439bfdd8",
  });

  const url2 = "https://grok.com/chat/xyz-987-abc";
  assert.deepEqual(getConversationId(url2), {
    siteId: "grok",
    conversationId: "xyz-987-abc",
  });

  const rootUrl = "https://grok.com/";
  assert.deepEqual(getConversationId(rootUrl), {
    siteId: "grok",
    conversationId: "",
  });
});

test("supported sites contains ChatGPT", () => {
  const chatgpt = SUPPORTED_SITES.find((s) => s.siteId === "chatgpt");
  assert.ok(chatgpt, "ChatGPT should be registered in SUPPORTED_SITES");
  assert.equal(chatgpt.displayName, "ChatGPT");
  assert.deepEqual(chatgpt.origins, [
    "https://chatgpt.com/",
    "https://chat.openai.com/",
  ]);
});

test("identifies ChatGPT URLs correctly", () => {
  const standardUrl =
    "https://chatgpt.com/c/6ab7b313-9008-83e8-b026-8a2b62f48364";
  assert.equal(isSupportedChatUrl(standardUrl), true);
  assert.equal(getSiteIdForUrl(standardUrl), "chatgpt");

  const gptsUrl =
    "https://chatgpt.com/g/g-p-6a773d82ddfc8191a7a992cc737e04ac-aikito/c/6ab7b313-9008-83e8-b026-8a2b62f48364";
  assert.equal(isSupportedChatUrl(gptsUrl), true);
  assert.equal(getSiteIdForUrl(gptsUrl), "chatgpt");

  const legacyUrl =
    "https://chat.openai.com/c/6ab7b313-9008-83e8-b026-8a2b62f48364";
  assert.equal(isSupportedChatUrl(legacyUrl), true);
  assert.equal(getSiteIdForUrl(legacyUrl), "chatgpt");
});

test("extracts ChatGPT conversationId correctly", () => {
  const standardUrl =
    "https://chatgpt.com/c/6ab7b313-9008-83e8-b026-8a2b62f48364";
  assert.deepEqual(getConversationId(standardUrl), {
    siteId: "chatgpt",
    conversationId: "6ab7b313-9008-83e8-b026-8a2b62f48364",
  });

  const gptsUrl =
    "https://chatgpt.com/g/g-p-6a773d82ddfc8191a7a992cc737e04ac-aikito/c/6ab7b313-9008-83e8-b026-8a2b62f48364";
  assert.deepEqual(getConversationId(gptsUrl), {
    siteId: "chatgpt",
    conversationId: "6ab7b313-9008-83e8-b026-8a2b62f48364",
  });

  const rootUrl = "https://chatgpt.com/";
  assert.deepEqual(getConversationId(rootUrl), {
    siteId: "chatgpt",
    conversationId: "",
  });
});

