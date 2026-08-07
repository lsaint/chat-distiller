import {
  deleteStoredHandle,
  ensureReadWritePermission,
  getStoredHandle,
  storeHandle,
} from "./db-utils.js";

const { localizeDocument, t } = globalThis.ChatDistillerI18n;
const ACTIVE_TASK_KEY = "activeExtractionTask";
const rootDirectoryInput = document.querySelector("#root-directory");
const relativeDirectoryInput = document.querySelector("#relative-directory");
const selectButton = document.querySelector("#select-directory");
const disconnectButton = document.querySelector("#disconnect");
const statusElement = document.querySelector("#status");
const CLOSE_COUNTDOWN_SECONDS = 5;
let closeCountdownTimer = null;

localizeDocument();
initialize().catch((error) => setStatus(normalizeError(error), "error"));

selectButton.addEventListener("click", async () => {
  cancelSidePanelClose();
  try {
    if (!("showDirectoryPicker" in window)) {
      throw new Error(t("unsupportedPicker"));
    }
    let handle = await getStoredHandle();
    const existingPermission = await handle?.queryPermission({ mode: "readwrite" });
    if (!handle || existingPermission === "granted") {
      handle = await window.showDirectoryPicker({
        id: "chat-distiller-root",
        mode: "readwrite",
        startIn: "documents",
      });
    }
    const permission = await ensureReadWritePermission(handle);
    if (permission !== "granted") {
      throw new Error(t("readWritePermissionRequired"));
    }
    await storeHandle(handle);
    await chrome.storage.local.set({
      selectedDirectoryName: handle.name,
      selectedDirectoryPath: handle.name,
    });
    rootDirectoryInput.value = handle.name;
    setStatus(t("rootConnected", handle.name), "success");
    await retryPendingTaskSave();
    scheduleSidePanelClose();
  } catch (error) {
    setStatus(
      error?.name === "AbortError" ? t("selectionCancelled") : normalizeError(error),
      error?.name === "AbortError" ? "muted" : "error"
    );
  }
});

disconnectButton.addEventListener("click", async () => {
  cancelSidePanelClose();
  try {
    await deleteStoredHandle();
    await chrome.storage.local.remove([
      "selectedDirectoryName",
      "selectedDirectoryPath",
    ]);
    rootDirectoryInput.value = "";
    setStatus(t("rootDisconnected"), "muted");
  } catch (error) {
    setStatus(normalizeError(error), "error");
  }
});

relativeDirectoryInput.addEventListener("input", (event) => {
  chrome.storage.local.set({ relativeDirectory: event.target.value }).catch(() => {});
});

async function initialize() {
  const stored = await chrome.storage.local.get([
    "selectedDirectoryName",
    "selectedDirectoryPath",
    "relativeDirectory",
  ]);
  relativeDirectoryInput.value = stored.relativeDirectory || "inbox";
  const handle = await getStoredHandle();
  const displayPath = stored.selectedDirectoryPath || stored.selectedDirectoryName || handle?.name || "";
  rootDirectoryInput.value = displayPath;
  if (!handle) {
    setStatus(displayPath ? t("pathNeedsAuthorization") : t("rootNotSet"), displayPath ? "error" : "muted");
    return;
  }
  const permission = await handle.queryPermission({ mode: "readwrite" });
  setStatus(
    permission === "granted"
      ? t("rootConnected", displayPath)
      : t("rootPermissionExpired", displayPath),
    permission === "granted" ? "success" : "error"
  );
}

function scheduleSidePanelClose() {
  cancelSidePanelClose();

  let secondsRemaining = CLOSE_COUNTDOWN_SECONDS;
  const renderCountdown = () => {
    setStatus(
      t("rootConnectedClosing", String(secondsRemaining)),
      "success"
    );
  };

  renderCountdown();
  closeCountdownTimer = setInterval(async () => {
    secondsRemaining -= 1;
    if (secondsRemaining > 0) {
      renderCountdown();
      return;
    }

    cancelSidePanelClose();
    await closeCurrentSidePanel();
  }, 1000);
}

function cancelSidePanelClose() {
  if (closeCountdownTimer === null) {
    return;
  }

  clearInterval(closeCountdownTimer);
  closeCountdownTimer = null;
}

async function closeCurrentSidePanel() {
  if (typeof chrome.sidePanel.close !== "function") {
    window.close();
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.windowId) {
    window.close();
    return;
  }

  try {
    await chrome.sidePanel.close({ tabId: tab.id });
  } catch {
    try {
      await chrome.sidePanel.close({ windowId: tab.windowId });
    } catch {
      window.close();
    }
  }
}

async function retryPendingTaskSave() {
  const stored = await chrome.storage.local.get(ACTIVE_TASK_KEY);
  const task = stored[ACTIVE_TASK_KEY];
  const canRetry = task?.status === "awaiting_permission" ||
    (task?.status === "error" && task?.result?.content);
  if (!canRetry) return;
  const response = await chrome.runtime.sendMessage({
    type: "RETRY_TASK_SAVE",
    jobId: task.jobId,
  });
  if (!response?.ok) {
    throw new Error(response?.error || t("retrySaveFailed"));
  }
  setStatus(response.task?.statusMessage || t("taskSuccess"), "success");
}

function setStatus(message, className) {
  statusElement.textContent = message;
  statusElement.className = className;
}

function normalizeError(error) {
  return error instanceof Error ? error.message : String(error);
}
