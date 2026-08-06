import "./i18n.js";

const { t } = globalThis.ChatDistillerI18n;

export async function saveMarkdownFile(rootHandle, payload, rootDisplay = "") {
  validatePayload(payload);

  const relativeSegments = sanitizeRelativePath(
    payload.relativeDirectory || "inbox"
  );

  let targetDirectory = rootHandle;
  for (const segment of relativeSegments) {
    targetDirectory = await targetDirectory.getDirectoryHandle(segment, {
      create: true,
    });
  }

  const requestedName = sanitizeFilename(
    payload.filename || createDefaultFilename(payload.title)
  );
  const finalName = await createUniqueFilename(
    targetDirectory,
    requestedName
  );

  const fileHandle = await targetDirectory.getFileHandle(finalName, {
    create: true,
  });
  const writable = await fileHandle.createWritable();

  try {
    await writable.write(normalizeMarkdown(payload.content));
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch {
      // Preserve the original write or close failure.
    }
    throw error;
  }

  const displayedRoot = rootDisplay || rootHandle.name || "storage";
  const cleanRoot = displayedRoot.replace(/[/\\]+$/, "");
  const fullPath = [cleanRoot, ...relativeSegments, finalName].join("/");

  return {
    filename: finalName,
    fullPath,
    relativePath: [...relativeSegments, finalName].join("/"),
  };
}

export async function markdownFileExists(rootHandle, relativePath) {
  try {
    const segments = sanitizeRelativePath(relativePath);
    const filename = segments.pop();
    let directory = rootHandle;

    for (const segment of segments) {
      directory = await directory.getDirectoryHandle(segment);
    }
    await directory.getFileHandle(filename);
    return true;
  } catch (error) {
    if (
      error?.name === "NotFoundError" ||
      error?.name === "TypeMismatchError"
    ) {
      return false;
    }
    return false;
  }
}

export function normalizeMarkdown(content) {
  let normalized = String(content).trim();
  const fencedDocument = normalized.match(
    /^\s*(`{3,})[ \t]*(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\1[ \t]*$/i
  );
  if (fencedDocument) {
    normalized = fencedDocument[2];
  }
  normalized = normalized.replace(
    /^\s*<!--\s*chat-distiller:v1\s*-->\s*(?:\r?\n)?/i,
    ""
  );
  normalized = normalized.replace(
    /^\s*<!--\s*filename:\s*[a-z0-9]+(?:-[a-z0-9]+)*\.md\s*-->\s*(?:\r?\n)?/i,
    ""
  );
  normalized = normalized.replace(
    /(?:\r?\n)?\s*<!--\s*\/chat-distiller:v1\s*-->\s*$/i,
    ""
  );
  return normalized.trim() + "\n";
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error(t("invalidResult"));
  }
  if (typeof payload.content !== "string" || !payload.content.trim()) {
    throw new Error(t("emptyResult"));
  }
  if (payload.content.length > 2_000_000) {
    throw new Error(t("oversizedResult"));
  }
}

function sanitizeRelativePath(relativePath) {
  const segments = String(relativePath)
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return ["inbox"];
  }

  for (const segment of segments) {
    if (
      segment === "." ||
      segment === ".." ||
      segment.includes("\0") ||
      segment.includes("/")
    ) {
      throw new Error(t("invalidSubdirectory"));
    }
  }

  return segments;
}

function sanitizeFilename(filename) {
  let safeName = String(filename)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 160);

  if (!safeName) {
    safeName = createDefaultFilename();
  }

  if (!safeName.toLowerCase().endsWith(".md")) {
    safeName += ".md";
  }

  return safeName;
}

function createDefaultFilename(title = "chat-memory") {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");

  const safeTitle = String(title)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "chat-memory";

  return `${safeTitle}-${stamp}.md`;
}

async function createUniqueFilename(directoryHandle, filename) {
  const dotIndex = filename.toLowerCase().endsWith(".md")
    ? filename.length - 3
    : filename.length;
  const base = filename.slice(0, dotIndex);
  const extension = filename.slice(dotIndex) || ".md";

  let candidate = filename;
  let counter = 2;

  while (await fileExists(directoryHandle, candidate)) {
    candidate = `${base}-${counter}${extension}`;
    counter += 1;
  }

  return candidate;
}

async function fileExists(directoryHandle, filename) {
  try {
    await directoryHandle.getFileHandle(filename);
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") {
      return false;
    }
    throw error;
  }
}
