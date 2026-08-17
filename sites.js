// Single source of truth for supported sites.
//
// Imported by popup.js (URL gating, siteId resolution) and service-worker.js
// (session key derivation). Content script adapters cannot import this file —
// they are classic scripts — so an adapter only declares its own `siteId` and
// the entry here must use the same string.
//
// Adding a site requires exactly two edits: a new entry below, and a matching
// `content_scripts` rule plus `host_permissions` in manifest.json. The origins
// listed here must stay in sync with that rule's `matches`.

export const SUPPORTED_SITES = [
  {
    siteId: "chatgpt",
    displayName: "ChatGPT",
    origins: ["https://chatgpt.com/", "https://chat.openai.com/"],
    conversationIdPattern: /\/c\/([^/]+)/,
  },
  {
    siteId: "deepseek",
    displayName: "DeepSeek",
    origins: ["https://chat.deepseek.com/"],
    conversationIdPattern: /\/a\/chat\/s\/([^/]+)/,
  },
  {
    siteId: "gemini",
    displayName: "Gemini",
    origins: ["https://gemini.google.com/"],
    conversationIdPattern: /\/app\/([^/]+)/,
  },
  {
    siteId: "doubao",
    displayName: "Doubao",
    origins: ["https://www.doubao.com/", "https://doubao.com/"],
    conversationIdPattern: /\/chat\/([^/?#]+)/,
  },
];

export function getSiteForUrl(url) {
  if (!url) {
    return null;
  }
  return (
    SUPPORTED_SITES.find((site) =>
      site.origins.some((origin) => url.startsWith(origin)),
    ) || null
  );
}

export function getSiteIdForUrl(url) {
  return getSiteForUrl(url)?.siteId || "";
}

export function isSupportedChatUrl(url) {
  return Boolean(getSiteForUrl(url));
}

// Resolve the stable conversation identifier used to deduplicate saves.
// `siteId` is authoritative when supplied; otherwise it is inferred from the URL
// so that a missing siteId degrades to the correct site instead of disabling
// deduplication entirely.
export function getConversationId(sourceUrl, siteId = "") {
  const site = siteId
    ? SUPPORTED_SITES.find((entry) => entry.siteId === siteId)
    : getSiteForUrl(sourceUrl);
  if (!site) {
    return { siteId: "", conversationId: "" };
  }

  try {
    const { pathname } = new URL(sourceUrl);
    return {
      siteId: site.siteId,
      conversationId: pathname.match(site.conversationIdPattern)?.[1] || "",
    };
  } catch {
    return { siteId: site.siteId, conversationId: "" };
  }
}
