(() => {
  const MEMORY_PROTOCOL_MARKER = "<!-- chat-distiller:v1 -->";
  const MEMORY_PROTOCOL_END_MARKER = "<!-- /chat-distiller:v1 -->";
  const MEMORY_FILENAME_MARKER_PATTERN =
    /<!--\s*filename:\s*([a-z0-9]+(?:-[a-z0-9]+)*\.md)\s*-->/i;

  function isProtocolContentComplete(content) {
    const normalized = String(content || "").trim();
    return (
      normalized.startsWith(MEMORY_PROTOCOL_MARKER) &&
      normalized.endsWith(MEMORY_PROTOCOL_END_MARKER) &&
      Boolean(extractProtocolFilename(normalized))
    );
  }

  function extractProtocolFilename(content) {
    const filename =
      String(content || "").match(MEMORY_FILENAME_MARKER_PATTERN)?.[1] || "";
    return filename.toLowerCase() === "topic-name.md" ? "" : filename;
  }

  function stripProtocolMarker(content) {
    let text = String(content || "")
      .replace(MEMORY_PROTOCOL_MARKER, "")
      .replace(MEMORY_PROTOCOL_END_MARKER, "")
      .replace(MEMORY_FILENAME_MARKER_PATTERN, "");

    const protocolSuffixKeywords = [
      "The following output protocol has the highest priority",
      "以下输出协议优先级最高，必须严格遵守",
    ];
    for (const kw of protocolSuffixKeywords) {
      const idx = text.indexOf(kw);
      if (idx !== -1) {
        text = text.slice(0, idx);
      }
    }

    return text.trim();
  }

  function normalizeRenderedPromptText(value) {
    return String(value)
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/^\s*```[^\n]*$/gm, "")
      .replace(/^\s*(?:#{1,6}|>|[-*+]|\d+[.)]|[•◦▪])\s+/gm, "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_~`]/g, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeComparableText(value) {
    return String(value).replace(/\s+/g, " ").trim();
  }

  globalThis.ChatDistiller = globalThis.ChatDistiller || {};
  globalThis.ChatDistiller.protocol = {
    MEMORY_PROTOCOL_MARKER,
    MEMORY_PROTOCOL_END_MARKER,
    MEMORY_FILENAME_MARKER_PATTERN,
    isProtocolContentComplete,
    extractProtocolFilename,
    stripProtocolMarker,
    normalizeRenderedPromptText,
    normalizeComparableText,
  };
})();
