import { getStoredHandle, getReadWritePermission } from "./db-utils.js";
import {
  checkPageReady,
  getActiveTab,
  startExtractionTask,
} from "./extraction-client.js";
import { isSupportedChatUrl } from "./sites.js";

const { getDefaultPrompt, getLocale, isDefaultPrompt, localizeDocument, t } =
  globalThis.ChatDistillerI18n;
const CURRENT_PROMPT_VERSION = 8;
const DEFAULT_PROMPT = getDefaultPrompt();

const ACTIVE_TASK_KEY = "activeExtractionTask";
const GITHUB_URL = "https://github.com/lsaint/chat-distiller";
const SUPPORT_URL =
  "https://lsaint.github.io/donation/?utm_source=chat-distiller&utm_medium=extension&utm_campaign=support";
const ACTIVE_TASK_STATUSES = new Set(["starting", "generating", "saving"]);
const ACTIONABLE_TASK_STATUSES = new Set([
  ...ACTIVE_TASK_STATUSES,
  "awaiting_permission",
]);

const mainView = document.querySelector("#main-view");
const refreshView = document.querySelector("#refresh-view");

const directoryStatus = document.querySelector("#directory-status");
const statusElement = document.querySelector("#status");
const generateButton = document.querySelector("#generate");
const generateAction = generateButton.closest(".actions");
const resetPromptButton = document.querySelector("#reset-prompt");
const openSettingsButton = document.querySelector("#open-settings");
const openGithubButton = document.querySelector("#open-github");
const openSupportButton = document.querySelector("#open-support");
const promptInput = document.querySelector("#prompt");
const filenameInput = document.querySelector("#filename");
const relativeDirectoryInput = document.querySelector("#relative-directory");

const taskActionButton = document.querySelector("#task-action");
const cancelTaskButton = document.querySelector("#cancel-task");
const refreshPageButton = document.querySelector("#refresh-page");

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
  renderTask(currentTask);
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

openSettingsButton?.addEventListener("click", openSettingsFromPopup);
openGithubButton?.addEventListener("click", () => openExternalPage(GITHUB_URL));
openSupportButton?.addEventListener("click", () =>
  openExternalPage(SUPPORT_URL),
);

generateButton.addEventListener("click", async () => {
  try {
    const prompt = promptInput.value.trim() || DEFAULT_PROMPT;
    const relativeDirectory = relativeDirectoryInput.value.trim() || "inbox";
    const filename = filenameInput.value.trim();

    const tab = await getActiveTab();

    if (!tab?.id || !isSupportedChatUrl(tab.url)) {
      throw new Error(t("unsupportedChat"));
    }

    const pageStatus = await checkPageReady(tab);
    if (!pageStatus.ready) {
      showRefreshView();
      return;
    }

    const rootHandle = await getStoredHandle();
    if (!rootHandle) {
      throw new Error(t("noRoot"));
    }

    let permission = await rootHandle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      // queryPermission can report a stale non-granted state right after the
      // side panel that obtained the grant is torn down. requestPermission()
      // here runs inside this click's user activation, so on platforms
      // (observed on Windows) where the cached grant needs re-confirming it
      // can resolve silently instead of forcing the user back into settings.
      permission = await rootHandle.requestPermission({ mode: "readwrite" });
    }
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

    const response = await startExtractionTask({
      prompt,
      relativeDirectory,
      filename,
    });

    if (!response?.ok) {
      throw new Error(response?.error || t("startTaskFailed"));
    }
    if (response.alreadySaved) {
      setStatus(t("alreadySaved", response.saved.fullPath), "success");
      return;
    }

    currentTask = response.task;
    renderTask(currentTask);
  } catch (error) {
    setStatus(normalizeError(error), "error");
  } finally {
    if (mainView.style.display !== "none") {
      generateButton.disabled = ACTIVE_TASK_STATUSES.has(currentTask?.status);
    }
  }
});

refreshPageButton?.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    if (tab?.id) {
      await chrome.tabs.reload(tab.id);
      window.close();
    }
  } catch (error) {
    setStatus(normalizeError(error), "error");
  }
});

directoryStatus?.addEventListener("click", openSettingsFromPopup);
directoryStatus?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openSettingsFromPopup();
  }
});

taskActionButton?.addEventListener("click", async () => {
  const canRetrySave =
    currentTask?.status === "awaiting_permission" ||
    (currentTask?.status === "error" && currentTask?.canRetrySave);
  if (!canRetrySave) {
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
    setStatus(normalizeError(error), "error");
  } finally {
    taskActionButton.disabled = false;
  }
});

cancelTaskButton?.addEventListener("click", async () => {
  if (!currentTask?.jobId) {
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
    setStatus(normalizeError(error), "error");
  } finally {
    cancelTaskButton.disabled = false;
  }
});

relativeDirectoryInput?.addEventListener("input", (event) => {
  const value = event.target.value;
  chrome.storage.local.set({ relativeDirectory: value }).catch(() => {});
});

promptInput?.addEventListener("input", () => {
  if (statusElement.className === "success") {
    setStatus("", "");
  }
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

  const tab = await getActiveTab();
  if (isSupportedChatUrl(tab?.url)) {
    const pageStatus = await checkPageReady(tab);
    if (!pageStatus.ready) {
      showRefreshView();
      return;
    }

    try {
      const currentPrompt = promptInput.value.trim() || DEFAULT_PROMPT;
      const reusableResponse = await chrome.tabs.sendMessage(tab.id, {
        type: "FIND_REUSABLE_EXTRACTION",
        payload: {
          prompt: currentPrompt,
          matchPromptInPage: true,
        },
      });
      if (reusableResponse?.alreadySaved && reusableResponse?.saved?.fullPath) {
        setStatus(
          t("alreadySaved", reusableResponse.saved.fullPath),
          "success",
        );
      }
    } catch {
      // Ignore if page check message fails
    }
  }

  showMainView();
  if (shouldShowTaskStatus(currentTask)) {
    renderTask(currentTask);
  }
}

function shouldShowTaskStatus(task) {
  return Boolean(
    task &&
    (ACTIONABLE_TASK_STATUSES.has(task.status) ||
      (task.status === "error" && task.canRetrySave)),
  );
}

function renderTask(task) {
  if (!task) {
    taskActionButton.style.display = "none";
    cancelTaskButton.style.display = "none";
    setStatus("", "");
    checkDirectoryStatus().catch(() => {});
    return;
  }

  const className =
    task.status === "success"
      ? "success"
      : task.status === "error"
        ? "error"
        : "muted";
  setStatus(task.statusMessage || taskStatusLabel(task.status), className);

  const canCancel =
    ACTIVE_TASK_STATUSES.has(task.status) ||
    task.status === "awaiting_permission";
  cancelTaskButton.style.display = canCancel ? "inline-block" : "none";
  generateButton.disabled = ACTIVE_TASK_STATUSES.has(task.status);

  if (task.status === "awaiting_permission") {
    taskActionButton.textContent = t("authorizeContinue");
    taskActionButton.style.display = "inline-block";
  } else if (task.status === "error" && task.canRetrySave) {
    taskActionButton.textContent = t("retrySave");
    taskActionButton.style.display = "inline-block";
  } else {
    taskActionButton.style.display = "none";
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
  refreshView.style.display = "none";
  mainView.style.display = "block";
  checkDirectoryStatus().catch(() => {});
  requestAnimationFrame(fitPopupContent);
}

function showRefreshView() {
  mainView.style.display = "none";
  refreshView.style.display = "block";
}

async function checkDirectoryStatus() {
  try {
    const stored = await chrome.storage.local.get([
      "selectedDirectoryName",
      "selectedDirectoryPath",
    ]);
    let displayPath =
      stored.selectedDirectoryPath ||
      (stored.selectedDirectoryName ? `~/${stored.selectedDirectoryName}` : "");

    const handle = await getStoredHandle();
    displayPath ||= handle?.name || "";

    if (!handle) {
      directoryStatus.value = displayPath
        ? t("pathNeedsAuthorization")
        : t("unauthorizedClickToSet");
      directoryStatus.className = "error";
      setGenerateAvailability(false);
      return;
    }

    const permission = await getReadWritePermission(handle);

    directoryStatus.value = displayPath;
    directoryStatus.className =
      permission === "granted" ? "success" : "muted";

    // A stored handle means the root directory is configured.
    // On Windows, queryPermission() may return "prompt" after the side panel
    // closes even though the handle is still valid. Keep Generate enabled so
    // its click handler can request permission within a user activation.
    setGenerateAvailability(true);
  } catch {
    directoryStatus.value = "";
    directoryStatus.className = "error";
    setGenerateAvailability(false);
  }
}

function setGenerateAvailability(available) {
  generateButton.disabled =
    !available || ACTIVE_TASK_STATUSES.has(currentTask?.status);
  if (available) {
    delete generateAction.dataset.tooltip;
  } else {
    generateAction.dataset.tooltip = t("configureRootFirst");
  }
}

async function openSettingsFromPopup() {
  try {
    await openSidePanel();
    window.close();
  } catch (error) {
    setStatus(normalizeError(error), "error");
  }
}

async function openExternalPage(url) {
  try {
    await chrome.tabs.create({ url });
    window.close();
  } catch (error) {
    setStatus(normalizeError(error), "error");
  }
}

async function openSidePanel() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error(t("openSettingsFailed"));
  }
  await chrome.sidePanel.open({ tabId: tab.id });
}

function setStatus(message, className) {
  statusElement.textContent = message || t("autoDisclosure");
  statusElement.className = className || "muted";
  fitPopupContent();
}

function fitPopupContent() {
  promptInput.classList.remove("compact-one-line", "compact-two-lines");
  if (document.documentElement.scrollHeight <= window.innerHeight) {
    return;
  }

  promptInput.classList.add("compact-one-line");
  if (document.documentElement.scrollHeight <= window.innerHeight) {
    return;
  }

  promptInput.classList.add("compact-two-lines");
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
