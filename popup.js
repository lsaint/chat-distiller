import { getStoredHandle } from "./db-utils.js";
import { getSiteIdForUrl, isSupportedChatUrl } from "./sites.js";

const {
  getDefaultPrompt,
  getLocale,
  getOutputProtocolSuffix,
  isDefaultPrompt,
  localizeDocument,
  t,
} = globalThis.ChatDistillerI18n;
const CURRENT_PROMPT_VERSION = 8;
const DEFAULT_PROMPT = getDefaultPrompt();

const MEMORY_PROTOCOL_MARKER = "<!-- chat-distiller:v1 -->";
const MEMORY_PROTOCOL_END_MARKER = "<!-- /chat-distiller:v1 -->";
const MEMORY_FILENAME_MARKER = "<!-- filename: topic-name.md -->";
const ACTIVE_TASK_KEY = "activeExtractionTask";
const ACTIVE_TASK_STATUSES = new Set(["starting", "generating", "saving"]);
const ACTIONABLE_TASK_STATUSES = new Set([
  ...ACTIVE_TASK_STATUSES,
  "awaiting_permission",
]);

const mainView = document.querySelector("#main-view");
const savingView = document.querySelector("#saving-view");

const directoryStatus = document.querySelector("#directory-status");
const statusElement = document.querySelector("#status");
const generateButton = document.querySelector("#generate");
const inlineSettingsButton = document.querySelector("#inline-settings");
const resetPromptButton = document.querySelector("#reset-prompt");
const promptInput = document.querySelector("#prompt");
const filenameInput = document.querySelector("#filename");
const relativeDirectoryInput = document.querySelector("#relative-directory");

const savingStatus = document.querySelector("#saving-status");
const taskActionButton = document.querySelector("#cancel-saving");
const cancelTaskButton = document.querySelector("#cancel-task");

let currentTask = null;

localizeDocument();
initialize().catch((error) => {
  setStatus(normalizeError(error), "error");
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[ACTIVE_TASK_KEY]) {
    return;
  }

  currentTask = changes[ACTIVE_TASK_KEY].newValue || null;
  if (savingView.style.display !== "none") {
    renderTask(currentTask);
  }
});

resetPromptButton?.addEventListener("click", async () => {
  promptInput.value = DEFAULT_PROMPT;
  await chrome.storage.local.set({
    prompt: DEFAULT_PROMPT,
    promptLocale: getLocale(),
    promptVersion: CURRENT_PROMPT_VERSION,
  });
  setStatus(t("promptReset"), "success");
});

generateButton.addEventListener("click", async () => {
  try {
    const prompt = promptInput.value.trim() || DEFAULT_PROMPT;
    const relativeDirectory = relativeDirectoryInput.value.trim() || "inbox";
    const filename = filenameInput.value.trim();

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id || !isSupportedChatUrl(tab.url)) {
      throw new Error(t("unsupportedChat"));
    }

    const rootHandle = await getStoredHandle();
    if (!rootHandle) {
      throw new Error(t("noRoot"));
    }

    const permission = await rootHandle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      await openSidePanel();
      window.close();
      return;
    }

    await chrome.storage.local.set({
      prompt,
      promptLocale: isDefaultPrompt(prompt) ? getLocale() : "custom",
      promptVersion: CURRENT_PROMPT_VERSION,
      relativeDirectory,
    });

    generateButton.disabled = true;
    setStatus(t("checkingSaved"), "muted");

    const response = await chrome.runtime.sendMessage({
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

    if (!response?.ok) {
      throw new Error(response?.error || t("startTaskFailed"));
    }
    if (response.alreadySaved) {
      setStatus(
        t("alreadySaved", response.saved.fullPath),
        "success"
      );
      return;
    }

    currentTask = response.task;
    showSavingView();
    renderTask(currentTask);
  } catch (error) {
    if (savingView.style.display !== "none") {
      setSavingStatus(normalizeError(error), "error");
      taskActionButton.textContent = t("back");
      return;
    }
    setStatus(normalizeError(error), "error");
  } finally {
    if (mainView.style.display !== "none") {
      generateButton.disabled = false;
    }
  }
});

inlineSettingsButton?.addEventListener("click", async () => {
  try {
    await openSidePanel();
    window.close();
  } catch (error) {
    setStatus(normalizeError(error), "error");
  }
});

taskActionButton?.addEventListener("click", async () => {
  const canRetrySave =
    currentTask?.status === "awaiting_permission" ||
    (currentTask?.status === "error" && currentTask?.canRetrySave);
  if (!canRetrySave) {
    showMainView();
    return;
  }

  try {
    taskActionButton.disabled = true;
    if (currentTask.status === "awaiting_permission") {
      await openSidePanel();
      window.close();
      return;
    }
    const response = await chrome.runtime.sendMessage({
      type: "RETRY_TASK_SAVE",
      jobId: currentTask.jobId,
    });
    if (response?.task) {
      currentTask = response.task;
      renderTask(currentTask);
    }
    if (!response?.ok && !response?.task) {
      throw new Error(response?.error || t("retrySaveFailed"));
    }
  } catch (error) {
    setSavingStatus(normalizeError(error), "error");
  } finally {
    taskActionButton.disabled = false;
  }
});

cancelTaskButton?.addEventListener("click", async () => {
  if (!currentTask?.jobId) {
    showMainView();
    return;
  }

  try {
    cancelTaskButton.disabled = true;
    const response = await chrome.runtime.sendMessage({
      type: "CANCEL_TASK",
      jobId: currentTask.jobId,
    });
    if (response?.task) {
      currentTask = response.task;
      renderTask(currentTask);
    }
  } catch (error) {
    setSavingStatus(normalizeError(error), "error");
  } finally {
    cancelTaskButton.disabled = false;
  }
});

relativeDirectoryInput?.addEventListener("input", (event) => {
  const value = event.target.value;
  chrome.storage.local.set({ relativeDirectory: value }).catch(() => {});
});

async function initialize() {
  const stored = await chrome.storage.local.get([
    "prompt",
    "promptLocale",
    "promptVersion",
    "relativeDirectory",
    "selectedDirectoryName",
    "selectedDirectoryPath",
    ACTIVE_TASK_KEY,
  ]);

  const hasManagedDefault =
    stored.promptLocale &&
    stored.promptLocale !== "custom" &&
    isDefaultPrompt(stored.prompt);
  if (!stored.prompt || hasManagedDefault) {
    promptInput.value = DEFAULT_PROMPT;
    await chrome.storage.local.set({
      prompt: DEFAULT_PROMPT,
      promptLocale: getLocale(),
      promptVersion: CURRENT_PROMPT_VERSION,
    });
  } else {
    promptInput.value = stored.prompt;
    if (
      stored.promptLocale !== "custom" ||
      stored.promptVersion !== CURRENT_PROMPT_VERSION
    ) {
      await chrome.storage.local.set({
        promptLocale: "custom",
        promptVersion: CURRENT_PROMPT_VERSION,
      });
    }
  }

  const relativeDirectory = stored.relativeDirectory || "inbox";
  relativeDirectoryInput.value = relativeDirectory;

  currentTask = stored[ACTIVE_TASK_KEY] || null;
  await checkDirectoryStatus();

  if (shouldOpenTaskView(currentTask)) {
    showSavingView();
    renderTask(currentTask);
  } else {
    showMainView();
  }
}

function shouldOpenTaskView(task) {
  return Boolean(
    task &&
    (
      ACTIONABLE_TASK_STATUSES.has(task.status) ||
      (task.status === "error" && task.canRetrySave)
    )
  );
}

function renderTask(task) {
  if (!task) {
    setSavingStatus(t("noRunningTask"), "muted");
    taskActionButton.textContent = t("back");
    if (cancelTaskButton) {
      cancelTaskButton.style.display = "none";
    }
    return;
  }

  const className = task.status === "success"
    ? "success"
    : task.status === "error"
      ? "error"
      : "muted";
  setSavingStatus(task.statusMessage || taskStatusLabel(task.status), className);

  if (cancelTaskButton) {
    const canCancel = Boolean(
      task &&
      (ACTIVE_TASK_STATUSES.has(task.status) || task.status === "awaiting_permission")
    );
    cancelTaskButton.style.display = canCancel ? "inline-block" : "none";
  }

  if (task.status === "awaiting_permission") {
    taskActionButton.textContent = t("authorizeContinue");
  } else if (task.status === "error" && task.canRetrySave) {
    taskActionButton.textContent = t("retrySave");
  } else if (task.status === "success") {
    taskActionButton.textContent = t("done");
  } else if (ACTIVE_TASK_STATUSES.has(task.status)) {
    taskActionButton.textContent = t("backBackground");
  } else {
    taskActionButton.textContent = t("back");
  }
}

function taskStatusLabel(status) {
  const labels = {
    starting: t("taskStarting"),
    generating: t("taskGenerating"),
    saving: t("taskSaving"),
    awaiting_permission: t("taskAwaitingPermission"),
    success: t("taskSuccess"),
    error: t("taskError"),
  };
  return labels[status] || t("taskUnknown");
}

function showMainView() {
  savingView.style.display = "none";
  mainView.style.display = "block";
  checkDirectoryStatus().catch(() => {});
}

function showSavingView() {
  mainView.style.display = "none";
  savingView.style.display = "block";
}

async function checkDirectoryStatus() {
  try {
    const stored = await chrome.storage.local.get([
      "selectedDirectoryName",
      "selectedDirectoryPath",
    ]);
    let displayPath = stored.selectedDirectoryPath ||
      (stored.selectedDirectoryName ? `~/${stored.selectedDirectoryName}` : "");
    const handle = await getStoredHandle();
    displayPath ||= handle?.name || "";
    if (displayPath && handle) {
      directoryStatus.value = displayPath;
      directoryStatus.className = "success";
      generateButton.disabled = false;
      inlineSettingsButton.style.display = "inline-block";
      inlineSettingsButton.textContent = t("changeSettings");
    } else {
      directoryStatus.value = displayPath
        ? t("pathNeedsAuthorization")
        : t("rootNotSet");
      directoryStatus.className = "error";
      generateButton.disabled = true;
      inlineSettingsButton.style.display = "inline-block";
      inlineSettingsButton.textContent = t("openSettings");
    }
  } catch {
    directoryStatus.value = "";
    directoryStatus.className = "error";
    generateButton.disabled = true;
  }
}

async function openSidePanel() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error(t("openSettingsFailed"));
  }
  await chrome.sidePanel.open({ tabId: tab.id });
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

function setStatus(message, className) {
  statusElement.textContent = message;
  statusElement.className = className;
}

function setSavingStatus(message, className) {
  savingStatus.textContent = message;
  savingStatus.className = className;
}

function normalizeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("Could not establish connection") ||
    message.includes("Receiving end does not exist")
  ) {
    return t("communicationFailed");
  }
  return message;
}
