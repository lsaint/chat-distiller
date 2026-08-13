import "./prompt-constants.js";
import "./i18n.js";
import { getStoredHandle } from "./db-utils.js";
import { markdownFileExists, saveMarkdownFile } from "./file-utils.js";
import { getConversationId } from "./sites.js";

const { t } = globalThis.ChatDistillerI18n;
const ACTIVE_TASK_KEY = "activeExtractionTask";
const SAVED_SESSION_KEY_PREFIX = "savedChatSession:";
const TASK_ALARM_PREFIX = "chat-distiller-task:";
const TASK_TIMEOUT_MINUTES = 10;
const SAVING_TIMEOUT_MINUTES = 1;
const STARTING_STATUSES = new Set(["starting"]);
const GENERATION_STATUSES = new Set(["starting", "generating"]);
const ACTIVE_STATUSES = new Set(["starting", "generating", "saving"]);
const BLOCKING_STATUSES = new Set([...ACTIVE_STATUSES, "awaiting_permission"]);
const EXTENSION_PAGE_MESSAGE_TYPES = new Set([
  "RETRY_TASK_SAVE",
  "START_EXTRACTION_TASK",
  "CANCEL_TASK",
]);
let taskUpdateQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener((details) => {
  configureSidePanel().catch(() => {});
  reconcileTaskAfterExtensionUpdate(details).catch(() => {});
});
configureSidePanel().catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    EXTENSION_PAGE_MESSAGE_TYPES.has(message?.type) &&
    sender.tab !== undefined
  ) {
    sendResponse({ ok: false, error: t("unauthorizedSender") });
    return false;
  }

  if (message?.type === "START_EXTRACTION_TASK") {
    startExtractionTask(message.payload)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          ok: false,
          error: normalizeError(error),
        }),
      );
    return true;
  }

  if (message?.type === "CANCEL_TASK") {
    cancelTask(message.jobId)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          ok: false,
          error: normalizeError(error),
        }),
      );
    return true;
  }

  if (message?.type === "EXTRACTION_RESULT") {
    handleExtractionResult(message, sender)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          ok: false,
          error: normalizeError(error),
        }),
      );
    return true;
  }

  if (message?.type === "RETRY_TASK_SAVE") {
    retryTaskSave(message.jobId)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          ok: false,
          error: normalizeError(error),
        }),
      );
    return true;
  }

  if (message?.type === "RETRY_TASK_SAVE_FROM_TAB") {
    retryTaskSaveFromTab(message, sender)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          ok: false,
          error: normalizeError(error),
        }),
      );
    return true;
  }

  if (message?.type === "OPEN_SIDE_PANEL_FROM_TAB") {
    openSidePanelFromTab(message, sender)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          ok: false,
          error: normalizeError(error),
        }),
      );
    return true;
  }

  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(TASK_ALARM_PREFIX)) {
    return;
  }

  const jobId = alarm.name.slice(TASK_ALARM_PREFIX.length);
  failTaskIfCurrent(jobId, t("generationTimeout")).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  failTaskForTab(tabId, t("tabClosed")).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    failTaskForTab(tabId, t("tabNavigated")).catch(() => {});
  }
});

async function startExtractionTask(payload) {
  validateStartPayload(payload);

  const sessionKey = getSessionKey(payload.sourceUrl, payload.siteId);
  const promptFingerprint = await createPromptFingerprint(payload.prompt);
  const savedSession = await getSavedSessionState(sessionKey);
  // Skip the early alreadySaved return; always consult the DOM-side
  // findReusableResult which can detect whether the conversation has
  // grown since the last save (card position vs last assistant message).

  const hasRecordedPrompt = Boolean(savedSession.record?.promptFingerprint);
  const recordedPromptMatches =
    savedSession.record?.promptFingerprint === promptFingerprint;
  const domTask = {
    jobId: payload.jobId,
    tabId: payload.tabId,
    prompt: payload.prompt,
    siteId: payload.siteId || "",
  };

  let reusableResult =
    hasRecordedPrompt && !recordedPromptMatches
      ? null
      : await findReusableResult(domTask, {
          matchPromptInPage: !recordedPromptMatches,
        });

  if (reusableResult?.alreadySaved && reusableResult?.saved) {
    const savedFileStillExists = await savedFileExists(reusableResult.saved);

    if (savedFileStillExists) {
      await storeSavedSession(
        sessionKey,
        reusableResult.saved,
        promptFingerprint,
      );
      return {
        ok: true,
        alreadySaved: true,
        saved: reusableResult.saved,
      };
    }

    // A restored DOM card can outlive the Markdown file on disk.
    // If that file was deleted, reuse the already-generated Memory content
    // and write it again instead of treating the stale card as authoritative.
    reusableResult = reusableResult.result || null;
    if (sessionKey) {
      await chrome.storage.local.remove(savedSessionStorageKey(sessionKey));
    }
  }

  const task = {
    jobId: payload.jobId,
    tabId: payload.tabId,
    prompt: payload.prompt,
    promptFingerprint,
    sessionKey,
    siteId: payload.siteId || "",
    filename: payload.filename || "",
    relativeDirectory: payload.relativeDirectory || "inbox",
    status: "starting",
    statusMessage: t("submittingPrompt"),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await enqueueTaskCreation(task);

  try {
    if (reusableResult) {
      await chrome.alarms.create(taskAlarmName(task.jobId), {
        delayInMinutes: SAVING_TIMEOUT_MINUTES,
      });
      const savingTask = await updateTask(task, {
        status: "saving",
        statusMessage: t("reusingResult"),
        prompt: null,
        result: reusableResult,
        reusedExistingResult: true,
      });
      await notifyTab(savingTask);
      return saveTaskResult(savingTask);
    }

    await chrome.alarms.create(taskAlarmName(task.jobId), {
      delayInMinutes: TASK_TIMEOUT_MINUTES,
    });

    const response = await chrome.tabs.sendMessage(task.tabId, {
      type: "START_EXTRACTION",
      payload: {
        jobId: task.jobId,
        prompt: task.prompt,
        tabId: task.tabId,
        collapseOutput: true,
      },
    });

    if (!response?.ok) {
      throw new Error(response?.error || t("extractionStartFailed"));
    }

    try {
      const generatingTask = await updateTask(
        task,
        {
          status: "generating",
          statusMessage: t("generatingBackground"),
        },
        STARTING_STATUSES,
      );
      await notifyTab(generatingTask);
      return { ok: true, task: publicTask(generatingTask) };
    } catch (error) {
      const currentTask = await getActiveTask();
      if (
        currentTask?.jobId === task.jobId &&
        currentTask.status !== "starting"
      ) {
        return { ok: true, task: publicTask(currentTask) };
      }
      throw error;
    }
  } catch (error) {
    const failedTask = await updateTask(
      task,
      {
        status: "error",
        statusMessage: normalizeError(error),
        error: normalizeError(error),
      },
      GENERATION_STATUSES,
    ).catch(() => null);
    if (failedTask) {
      await clearTaskAlarm(task.jobId);
      await notifyTab(failedTask);
    } else {
      const currentTask = await getActiveTask();
      if (
        currentTask?.jobId === task.jobId &&
        !GENERATION_STATUSES.has(currentTask.status)
      ) {
        return { ok: true, task: publicTask(currentTask) };
      }
    }
    throw error;
  }
}

async function reconcileTaskAfterExtensionUpdate(details) {
  if (details.reason !== "update") {
    return;
  }

  const task = await getActiveTask();
  if (!task || !GENERATION_STATUSES.has(task.status)) {
    return;
  }

  const interruptedTask = await updateTask(task, {
    status: "error",
    statusMessage: t("updateInterrupted"),
    error: t("updateInterruptedError"),
  });
  await clearTaskAlarm(task.jobId);
  await notifyTab(interruptedTask);
}

async function handleExtractionResult(message, sender) {
  const task = await getActiveTask();
  if (!task) {
    return { ok: false, ignored: true };
  }

  const payload = message.payload || {};
  if (
    !sender.tab ||
    sender.tab.id !== task.tabId ||
    payload.jobId !== task.jobId ||
    !GENERATION_STATUSES.has(task.status)
  ) {
    return { ok: false, ignored: true };
  }

  if (!payload.ok) {
    const failedTask = await updateTask(
      task,
      {
        status: "error",
        statusMessage: payload.error || t("extractionFailed"),
        error: payload.error || t("extractionFailed"),
      },
      GENERATION_STATUSES,
    );
    await clearTaskAlarm(task.jobId);
    await notifyTab(failedTask);
    return { ok: false, task: publicTask(failedTask) };
  }

  if (
    typeof payload.content !== "string" ||
    !payload.content.trim() ||
    payload.content.length > 2_000_000
  ) {
    const failedTask = await updateTask(
      task,
      {
        status: "error",
        statusMessage: t("invalidMarkdown"),
        error: t("invalidMarkdown"),
      },
      GENERATION_STATUSES,
    );
    await clearTaskAlarm(task.jobId);
    await notifyTab(failedTask);
    return { ok: false, task: publicTask(failedTask) };
  }

  await chrome.alarms.create(taskAlarmName(task.jobId), {
    delayInMinutes: SAVING_TIMEOUT_MINUTES,
  });

  const savingTask = await updateTask(
    task,
    {
      status: "saving",
      statusMessage: t("writingResult"),
      prompt: null,
      result: {
        content: payload.content,
        filename: payload.filename,
        title: payload.title,
        sourceUrl: payload.sourceUrl,
        siteId: payload.siteId,
      },
    },
    GENERATION_STATUSES,
  );
  await notifyTab(savingTask);
  return saveTaskResult(savingTask);
}

async function retryTaskSave(jobId) {
  const task = await getActiveTask();
  if (!task || task.jobId !== jobId) {
    throw new Error(t("staleTaskUpdate"));
  }

  if (task.result?.content) {
    await chrome.alarms.create(taskAlarmName(task.jobId), {
      delayInMinutes: SAVING_TIMEOUT_MINUTES,
    });

    const savingTask = await updateTask(task, {
      status: "saving",
      statusMessage: t("retryWriting"),
      error: null,
    });
    await notifyTab(savingTask);
    return saveTaskResult(savingTask);
  }

  const updatingTask = await updateTask(task, {
    status: "saving",
    statusMessage: t("recheckingDom"),
    error: null,
  });
  await notifyTab(updatingTask);

  try {
    const response = await chrome.tabs.sendMessage(task.tabId, {
      type: "RETRY_EXTRACTION_FROM_DOM",
      payload: {
        jobId: task.jobId,
      },
    });

    if (!response?.ok || !response?.result?.content) {
      throw new Error(response?.error || t("extractionFailed"));
    }

    await chrome.alarms.create(taskAlarmName(task.jobId), {
      delayInMinutes: SAVING_TIMEOUT_MINUTES,
    });

    const savingTask = await updateTask(task, {
      status: "saving",
      statusMessage: t("writingResult"),
      prompt: null,
      result: {
        content: response.result.content,
        filename: response.result.filename,
        title: response.result.title,
        sourceUrl: response.result.sourceUrl,
        siteId: response.result.siteId,
      },
    });
    await notifyTab(savingTask);
    return saveTaskResult(savingTask);
  } catch (error) {
    const failedTask = await updateTask(task, {
      status: "error",
      statusMessage: normalizeError(error),
      error: normalizeError(error),
    });
    await clearTaskAlarm(task.jobId);
    await notifyTab(failedTask);
    return { ok: false, task: publicTask(failedTask) };
  }
}

async function retryTaskSaveFromTab(message, sender) {
  const task = await getAuthorizedContentTask(message.jobId, sender);
  return retryTaskSave(task.jobId);
}

async function openSidePanelFromTab(message, sender) {
  const task = await getAuthorizedContentTask(message.jobId, sender);
  await chrome.sidePanel.open({ tabId: task.tabId });
  return { ok: true };
}

async function configureSidePanel() {
  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: false,
  });
}

async function getAuthorizedContentTask(jobId, sender) {
  const task = await getActiveTask();
  const canRetry =
    Boolean(task?.result?.content) || isRecoverableError(task?.error, task);
  if (
    !task ||
    task.jobId !== jobId ||
    sender.tab?.id !== task.tabId ||
    !canRetry
  ) {
    throw new Error(t("unauthorizedSender"));
  }
  return task;
}

async function saveTaskResult(task) {
  try {
    const rootHandle = await getStoredHandle();
    if (!rootHandle) {
      throw createPermissionError(t("localHandleMissing"));
    }

    const permission = await rootHandle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      // Permission requests must be initiated from an extension page with
      // user activation. The service worker only checks the current state.
      throw createPermissionError(t("localPermissionExpired"));
    }

    const rootDisplay = rootHandle.name || "storage";
    const saved = await saveMarkdownFile(
      rootHandle,
      {
        content: task.result.content,
        title: task.result.title,
        filename: task.filename || task.result.filename,
        relativeDirectory: task.relativeDirectory,
      },
      rootDisplay,
    );

    const successfulTask = await updateTask(task, {
      status: "success",
      statusMessage: task.reusedExistingResult
        ? t("savedReused", saved.fullPath)
        : t("savedPath", saved.fullPath),
      saved,
      result: null,
      completedAt: Date.now(),
    });
    await storeSavedSession(task.sessionKey, saved, task.promptFingerprint);
    await clearTaskAlarm(task.jobId);
    await notifyTab(successfulTask);
    return { ok: true, task: publicTask(successfulTask) };
  } catch (error) {
    const permissionRequired =
      error?.code === "PERMISSION_REQUIRED" ||
      error?.name === "NotAllowedError";
    const failedTask = await updateTask(task, {
      status: permissionRequired ? "awaiting_permission" : "error",
      statusMessage: normalizeError(error),
      error: normalizeError(error),
    });
    await clearTaskAlarm(task.jobId);
    await notifyTab(failedTask);
    return { ok: false, task: publicTask(failedTask) };
  }
}

async function failTaskForTab(tabId, message) {
  const task = await getActiveTask();
  if (!task || task.tabId !== tabId || !GENERATION_STATUSES.has(task.status)) {
    return;
  }

  const failedTask = await updateTask(
    task,
    {
      status: "error",
      statusMessage: message,
      error: message,
    },
    GENERATION_STATUSES,
  );
  await clearTaskAlarm(task.jobId);
  await notifyTab(failedTask);
}

async function failTaskIfCurrent(jobId, message) {
  const task = await getActiveTask();
  if (!task || task.jobId !== jobId || !ACTIVE_STATUSES.has(task.status)) {
    return;
  }

  const failureMessage = task.status === "saving" ? t("saveTimeout") : message;

  const failedTask = await updateTask(
    task,
    {
      status: "error",
      statusMessage: failureMessage,
      error: failureMessage,
    },
    ACTIVE_STATUSES,
  );
  await clearTaskAlarm(task.jobId);
  await notifyTab(failedTask);
}

async function cancelTask(jobId) {
  const task = await getActiveTask();
  if (!task || (jobId && task.jobId !== jobId)) {
    return { ok: false, error: t("staleTaskUpdate") };
  }
  if (!BLOCKING_STATUSES.has(task.status)) {
    return { ok: true, task: publicTask(task) };
  }

  const cancelledTask = await updateTask(task, {
    status: "error",
    statusMessage: t("taskCancelled"),
    error: t("taskCancelled"),
  });
  await clearTaskAlarm(task.jobId);
  await notifyTab(cancelledTask);
  return { ok: true, task: publicTask(cancelledTask) };
}

async function enqueueTaskCreation(task) {
  const queuedCreation = taskUpdateQueue.then(async () => {
    const currentTask = await getActiveTask();
    if (currentTask && BLOCKING_STATUSES.has(currentTask.status)) {
      throw new Error(t("taskBlocked"));
    }
    return storeTask(task);
  });
  taskUpdateQueue = queuedCreation.catch(() => {});
  return queuedCreation;
}

async function getActiveTask() {
  const stored = await chrome.storage.local.get(ACTIVE_TASK_KEY);
  return stored[ACTIVE_TASK_KEY] || null;
}

async function findReusableResult(task, options = {}) {
  try {
    const response = await chrome.tabs.sendMessage(task.tabId, {
      type: "FIND_REUSABLE_EXTRACTION",
      payload: {
        jobId: task.jobId,
        matchPromptInPage: options.matchPromptInPage !== false,
        prompt: task.prompt,
      },
    });
    if (response?.alreadySaved && response?.saved) {
      return {
        alreadySaved: true,
        saved: response.saved,
        result: response.result,
      };
    }
    return response?.reusable ? response.result : null;
  } catch {
    return null;
  }
}

async function savedFileExists(saved) {
  if (!saved?.relativePath) {
    return false;
  }

  const rootHandle = await getStoredHandle();
  if (!rootHandle) {
    return false;
  }

  return markdownFileExists(rootHandle, saved.relativePath);
}

async function getSavedSessionState(sessionKey) {
  if (!sessionKey) {
    return { record: null, fileExists: false };
  }

  const storageKey = savedSessionStorageKey(sessionKey);
  const stored = await chrome.storage.local.get(storageKey);
  const record = stored[storageKey];
  if (!record?.saved?.relativePath) {
    return { record: null, fileExists: false };
  }

  const rootHandle = await getStoredHandle();
  if (!rootHandle) {
    return { record, fileExists: false };
  }

  const fileExists = await markdownFileExists(
    rootHandle,
    record.saved.relativePath,
  );
  return { record, fileExists };
}

async function storeSavedSession(sessionKey, saved, promptFingerprint) {
  if (!sessionKey) {
    return;
  }

  try {
    await chrome.storage.local.set({
      [savedSessionStorageKey(sessionKey)]: {
        saved,
        promptFingerprint,
        savedAt: Date.now(),
      },
    });
  } catch (error) {
    // Saving the file succeeded; a failed optimization index must not fail the task.
    console.warn("Failed to index saved chat session:", error);
  }
}

function getSessionKey(sourceUrl, siteId) {
  // A missing siteId must not disable deduplication: getConversationId() infers
  // the site from the URL, so the key stays stable even if the caller omits it.
  const resolved = getConversationId(sourceUrl, siteId);
  if (!resolved.siteId) {
    console.warn(
      "Unrecognized chat site, skipping save deduplication:",
      sourceUrl,
    );
    return "";
  }
  return resolved.conversationId
    ? `${resolved.siteId}:${resolved.conversationId}`
    : "";
}

function savedSessionStorageKey(sessionKey) {
  return `${SAVED_SESSION_KEY_PREFIX}${sessionKey}`;
}

async function createPromptFingerprint(prompt) {
  const bytes = new TextEncoder().encode(prompt);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function storeTask(task) {
  await chrome.storage.local.set({ [ACTIVE_TASK_KEY]: task });
  return task;
}

async function updateTask(task, changes, allowedStatuses = null) {
  const queuedUpdate = taskUpdateQueue.then(async () => {
    const currentTask = await getActiveTask();
    if (!currentTask || currentTask.jobId !== task.jobId) {
      throw new Error(t("staleTaskUpdate"));
    }
    if (allowedStatuses && !allowedStatuses.has(currentTask.status)) {
      throw new Error(t("staleTaskUpdate"));
    }
    return storeTask({
      ...currentTask,
      ...changes,
      updatedAt: Date.now(),
    });
  });
  taskUpdateQueue = queuedUpdate.catch(() => {});
  return queuedUpdate;
}

async function notifyTab(task) {
  try {
    await chrome.tabs.sendMessage(task.tabId, {
      type: "EXTRACTION_TASK_STATUS",
      payload: publicTask(task),
    });
  } catch {
    // The tab may have closed after the task reached a terminal state.
  }
}

function isRecoverableError(errorMessage, task) {
  if (task?.result?.content) {
    return true;
  }

  const msg = String(errorMessage || "");
  if (!msg) {
    return false;
  }

  if (
    msg.includes(t("tabClosed")) ||
    msg.includes(t("tabNavigated")) ||
    msg.includes(t("communicationFailed")) ||
    msg.includes(t("updateInterrupted")) ||
    msg.includes(t("updateInterruptedError")) ||
    msg.includes(t("taskCancelled")) ||
    msg.includes(t("extractionCancelled"))
  ) {
    return false;
  }

  return (
    msg.includes(t("protocolIncomplete")) ||
    msg.includes(t("markdownMissing")) ||
    msg.includes(t("localHandleMissing")) ||
    msg.includes(t("localPermissionExpired")) ||
    msg.includes(t("rootPermissionRequired")) ||
    msg.includes(t("writePermissionRequired")) ||
    msg.includes(t("readWritePermissionRequired")) ||
    msg.includes(t("saveTimeout")) ||
    msg.includes(t("extractionFailed"))
  );
}

function publicTask(task) {
  const { prompt, promptFingerprint, result, sessionKey, ...safeTask } = task;
  return {
    ...safeTask,
    canRetrySave:
      Boolean(result?.content) || isRecoverableError(task.error, task),
  };
}

function validateStartPayload(payload) {
  if (
    !payload ||
    typeof payload.jobId !== "string" ||
    !payload.jobId ||
    !Number.isInteger(payload.tabId) ||
    typeof payload.prompt !== "string" ||
    !payload.prompt.trim() ||
    typeof payload.sourceUrl !== "string"
  ) {
    throw new Error(t("invalidTask"));
  }
}

function createPermissionError(message) {
  const error = new Error(message);
  error.code = "PERMISSION_REQUIRED";
  return error;
}

function taskAlarmName(jobId) {
  return `${TASK_ALARM_PREFIX}${jobId}`;
}

async function clearTaskAlarm(jobId) {
  await chrome.alarms.clear(taskAlarmName(jobId));
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
