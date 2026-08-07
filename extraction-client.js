import { getSiteIdForUrl, isSupportedChatUrl } from "./sites.js";

const { getOutputProtocolSuffix, t } = globalThis.ChatDistillerI18n;
const MEMORY_PROTOCOL_MARKER = "<!-- chat-distiller:v1 -->";
const MEMORY_PROTOCOL_END_MARKER = "<!-- /chat-distiller:v1 -->";
const MEMORY_FILENAME_MARKER = "<!-- filename: topic-name.md -->";

export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab;
}

export async function checkPageReady(tab = null) {
  const activeTab = tab || await getActiveTab();
  if (!activeTab?.id) {
    return { ready: false, reason: "no-active-tab" };
  }

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: "AIKITO_PING",
    });
    const currentVersion = chrome.runtime.getManifest().version;
    if (!response?.ok || response.version !== currentVersion) {
      return { ready: false, reason: "version-mismatch" };
    }
    return { ready: true };
  } catch {
    return { ready: false, reason: "content-script-missing" };
  }
}

export async function startExtractionTask({
  prompt,
  relativeDirectory = "inbox",
  filename = "",
}) {
  const tab = await getActiveTab();
  if (!tab?.id || !isSupportedChatUrl(tab.url)) {
    throw new Error(t("unsupportedChat"));
  }

  const pageStatus = await checkPageReady(tab);
  if (!pageStatus.ready) {
    throw new Error(t("communicationFailed"));
  }

  return chrome.runtime.sendMessage({
    type: "START_EXTRACTION_TASK",
    payload: {
      jobId: crypto.randomUUID(),
      tabId: tab.id,
      prompt: enforceOutputProtocol(prompt),
      relativeDirectory,
      filename,
      sourceUrl: tab.url,
      siteId: getSiteIdForUrl(tab.url),
    },
  });
}

function enforceOutputProtocol(prompt) {
  if (
    prompt.includes(MEMORY_PROTOCOL_MARKER) &&
    prompt.includes(MEMORY_PROTOCOL_END_MARKER) &&
    prompt.includes(MEMORY_FILENAME_MARKER) &&
    prompt.includes("update_time") &&
    prompt.includes("Canvas")
  ) {
    return prompt;
  }

  return `${prompt.trim()}\n\n${getOutputProtocolSuffix()}`;
}
