(() => {
// Core engine — state machine, message routing, convergence loop, delivery retry,
// protocol observer. Site-agnostic; all site-specific behavior comes from ChatDistiller.adapter.

const { t } = globalThis.ChatDistillerI18n;
const adapter = globalThis.ChatDistiller.adapter;
const { MEMORY_PROTOCOL_MARKER } = globalThis.ChatDistiller.protocol;
const {
  isProtocolContentComplete,
  extractProtocolFilename,
  stripProtocolMarker,
  normalizeRenderedPromptText,
} = globalThis.ChatDistiller.protocol;
const {
  getElementText,
  getVisibleElementText,
  waitForElement,
  sleep,
} = globalThis.ChatDistiller.dom;
const {
  CARD_ATTRIBUTE,
  configureCardUi,
  ensureMemoryCard,
  updateMemoryCard,
  injectCardStyles,
} = globalThis.ChatDistiller.cardUi;

// Bridge adapter hooks into card-ui so core never reads ChatDistiller.adapter directly.
configureCardUi({
  resolveCardMountPoint: (el) => adapter.getCardMountPoint(el),
  resolveCollapseTarget: (el) => adapter.getCollapseTarget(el),
  resolvePromptTurn: (el) => adapter.getPromptCollapseTarget(el),
  runTaskAction: handleCardTaskAction,
});

// ---- Extraction state ----
let extractionInProgress = false;
let activeJobId = null;
let activeInitialAssistantSet = null;
let activeBaselineProtocolContent = "";
let activeTargetMessage = null;
let resultDeliveryStarted = false;
let pendingExtractionResult = null;
let resultDeliveryRetryTimer = null;
let protocolDeliveryTimer = null;
let activeRunId = 0;
const TERMINAL_TASK_STATUSES = new Set([
  "awaiting_permission",
  "error",
  "success",
]);

// ---- Message listener ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "EXTRACTION_TASK_STATUS") {
    updateMemoryCard(message.payload);
    if (
      message.payload?.jobId === activeJobId &&
      TERMINAL_TASK_STATUSES.has(message.payload?.status)
    ) {
      resetActiveExtractionState(activeRunId);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "FIND_REUSABLE_EXTRACTION") {
    sendResponse(findReusableExtraction(message.payload));
    return false;
  }

  if (message?.type !== "START_EXTRACTION") {
    return false;
  }

  if (extractionInProgress) {
    sendResponse({
      ok: false,
      error: t("extractionAlreadyRunning"),
    });
    return false;
  }

  extractionInProgress = true;
  const runId = ++activeRunId;
  activeJobId = message.payload?.jobId || null;
  resultDeliveryStarted = false;
  pendingExtractionResult = null;
  sendResponse({ ok: true, started: true });

  const payload = message.payload || message || {};

  extractConversationMemory(payload, runId)
    .then(async (result) => {
      await deliverExtractionResult({
        ok: true,
        ...result,
      }, runId);
    })
    .catch(async (error) => {
      const delivered = await deliverExtractionResult({
        ok: false,
        error: normalizeError(error),
      }, runId);
      if (delivered) {
        updateMemoryCard({
          jobId: payload.jobId,
          status: "error",
          statusMessage: normalizeError(error),
        });
      }
    });

  return false;
});

async function handleCardTaskAction(task) {
  try {
    if (task.status === "awaiting_permission") {
      const response = await chrome.runtime.sendMessage({
        type: "OPEN_SIDE_PANEL_FROM_TAB",
        jobId: task.jobId,
      });
      if (!response?.ok) {
        throw new Error(response?.error || t("openSettingsFailed"));
      }
      return;
    }

    updateMemoryCard({
      ...task,
      status: "saving",
      statusMessage: t("retryWriting"),
    });
    const response = await chrome.runtime.sendMessage({
      type: "RETRY_TASK_SAVE_FROM_TAB",
      jobId: task.jobId,
    });
    if (response?.task) {
      updateMemoryCard(response.task);
    }
    if (!response?.ok && !response?.task) {
      throw new Error(response?.error || t("retrySaveFailed"));
    }
  } catch (error) {
    updateMemoryCard({
      ...task,
      status: "error",
      statusMessage: normalizeError(error),
      canRetrySave: true,
    });
  }
}

// ---- Main extraction flow ----
async function extractConversationMemory(config = {}, runId) {
  assertActiveRun(runId);
  const promptText = config.prompt || config.payload?.prompt || "";
  const initialElements = adapter.getAssistantMessages();
  activeInitialAssistantSet = new WeakSet(initialElements);
  activeTargetMessage = null;
  activeBaselineProtocolContent = readProtocolContent(
    initialElements[initialElements.length - 1]
  );

  try {
    await submitPrompt(promptText, runId);
  } catch (error) {
    throw new Error(t("automaticSubmissionFailed", normalizeError(error)));
  }

  assertActiveRun(runId);
  const generatedElement = await waitForNewAssistantMessage(runId);
  if (config.collapseOutput !== false) {
    ensureMemoryCard(generatedElement, config.jobId, {
      status: "generating",
      statusMessage: buildGeneratingMessage(generatedElement),
    });
  }

  const content = await waitForStableAssistantContent(generatedElement, runId);

  if (!content.trim()) {
    throw new Error(t("emptyAiResponse"));
  }

  if (activeJobId === config.jobId && !resultDeliveryStarted) {
    updateMemoryCard({
      jobId: config.jobId,
      status: "saving",
      statusMessage: t("savingLocal"),
    });
  }

  return {
    content: stripProtocolMarker(content),
    filename: extractProtocolFilename(content),
    title: adapter.getConversationTitle(),
    sourceUrl: location.href,
    siteId: adapter.siteId,
  };
}

// ---- Prompt submission ----
async function submitPrompt(prompt, runId) {
  const editor = await waitForElement(adapter.findPromptEditor, 15_000);
  assertActiveRun(runId);
  editor.focus();

  const inserted = adapter.insertPrompt(editor, prompt);
  if (!inserted) {
    throw new Error(t("insertPromptFailed"));
  }

  await adapter.waitForEditorContent(editor, prompt, 4_000);
  assertActiveRun(runId);
  const sendButton = await waitForElement(adapter.findSendButton, 10_000);
  assertActiveRun(runId);

  if (
    sendButton.disabled ||
    sendButton.getAttribute("aria-disabled") === "true"
  ) {
    throw new Error(t("sendButtonDisabled"));
  }

  sendButton.click();
}

// ---- Protocol content reading ----
function readProtocolContent(element) {
  if (!element) {
    return "";
  }

  const selector = adapter.protocolBlockSelector || "pre code";
  const protocolBlock = Array.from(element.querySelectorAll(selector)).find(
    (codeBlock) => getElementText(codeBlock).includes(MEMORY_PROTOCOL_MARKER)
  );
  if (!protocolBlock) {
    return "";
  }

  const text = getElementText(protocolBlock).trim();
  return text.length > MEMORY_PROTOCOL_MARKER.length ? text : "";
}

// ---- Target message resolution ----
// Resolve the assistant message produced by the running job.
// Returns null while the AI is re-rendering, so callers treat that window as
// "no content yet" instead of silently reading the previous turn.
function getCurrentTargetMessage() {
  const messages = adapter.getAssistantMessages();
  if (messages.length === 0) {
    return null;
  }

  if (!activeInitialAssistantSet) {
    return messages[messages.length - 1];
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (!activeInitialAssistantSet.has(messages[index])) {
      activeTargetMessage = messages[index];
      return activeTargetMessage;
    }
  }

  // Nothing outside the baseline set. If this job never saw its own node, the
  // response has simply not been created yet: the AI can take a while to start,
  // and falling back to an earlier turn here would save the previous memory.
  if (!activeTargetMessage) {
    return null;
  }

  // The node we were tracking was replaced. Recover only once generation stopped,
  // and never accept a node that still carries the memory captured before the job
  // started.
  if (adapter.isGenerationActive()) {
    return null;
  }

  const lastMessage = messages[messages.length - 1];
  if (
    activeBaselineProtocolContent &&
    readProtocolContent(lastMessage) === activeBaselineProtocolContent
  ) {
    return null;
  }
  return lastMessage;
}

function buildGeneratingMessage(element) {
  const protocolContent = readProtocolContent(element);
  const chars = stripProtocolMarker(protocolContent).length;
  return chars > 0
    ? t("generatingMemoryChars", String(chars))
    : t("generatingMemory");
}

// ---- Reusable extraction ----
function findReusableExtraction(payload = {}) {
  if (adapter.isGenerationActive()) {
    return { ok: true, reusable: false };
  }

  const assistantMessages = adapter.getAssistantMessages();
  const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
  if (!lastAssistantMessage) {
    return { ok: true, reusable: false };
  }

  if (payload.matchPromptInPage !== false) {
    const prompt = normalizeRenderedPromptText(payload.prompt);
    const userMessages = adapter.getUserMessages();
    const lastUserMessage = userMessages[userMessages.length - 1];
    if (
      !prompt ||
      !lastUserMessage ||
      normalizeRenderedPromptText(getVisibleElementText(lastUserMessage)) !==
        prompt
    ) {
      return { ok: true, reusable: false };
    }
  }

  const protocolContent = readProtocolContent(lastAssistantMessage);
  if (!isProtocolContentComplete(protocolContent)) {
    return { ok: true, reusable: false };
  }
  const content = stripProtocolMarker(protocolContent);

  ensureMemoryCard(lastAssistantMessage, payload.jobId, {
    status: "saving",
    statusMessage: t("reusingResult"),
  });
  return {
    ok: true,
    reusable: true,
    result: {
      content,
      filename: extractProtocolFilename(protocolContent),
      title: adapter.getConversationTitle(),
      sourceUrl: location.href,
      siteId: adapter.siteId,
    },
  };
}

// ---- Wait for new assistant message ----
async function waitForNewAssistantMessage(runId) {
  assertActiveRun(runId);
  const existingMessage = getCurrentTargetMessage();
  if (existingMessage) {
    return existingMessage;
  }

  return new Promise((resolve, reject) => {
    const cancellationId = setInterval(() => {
      if (isActiveRun(runId)) {
        return;
      }
      clearInterval(cancellationId);
      clearTimeout(timeoutId);
      observer.disconnect();
      reject(new Error(t("extractionCancelled")));
    }, 250);
    const timeoutId = setTimeout(() => {
      clearInterval(cancellationId);
      observer.disconnect();
      reject(new Error(t("responseStartTimeout")));
    }, 180_000);

    const observer = new MutationObserver(() => {
      if (!isActiveRun(runId)) {
        clearInterval(cancellationId);
        clearTimeout(timeoutId);
        observer.disconnect();
        reject(new Error(t("extractionCancelled")));
        return;
      }
      const newMessage = getCurrentTargetMessage();
      if (!newMessage) {
        return;
      }

      clearInterval(cancellationId);
      clearTimeout(timeoutId);
      observer.disconnect();
      resolve(newMessage);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

// ---- Stable content convergence ----
async function waitForStableAssistantContent(element, runId) {
  const timeoutAt = Date.now() + 300_000;
  let target = element;
  let lastText = "";
  let stableSince = 0;
  let lastRawText = "";
  let rawStableSince = 0;

  const contentStableMs = adapter.contentStableMs || 5_000;
  const contentStableWithActionsMs = adapter.contentStableWithActionsMs || 1_000;

  while (Date.now() < timeoutAt) {
    assertActiveRun(runId);
    const current = findCurrentGeneratedMessage(target);
    if (current) {
      target = current;
    }

    if (activeJobId && current) {
      ensureMemoryCard(current, activeJobId, {
        status: "generating",
        statusMessage: buildGeneratingMessage(current),
      });
    }

    const currentText = current ? await extractMessageTextWithProtocol(current) : "";
    assertActiveRun(runId);
    const rawText = current ? extractRawMessageText(current) : "";
    const now = Date.now();
    const generationActive = adapter.isGenerationActive();
    const responseComplete = current ? adapter.hasResponseActions(current) : false;

    if (currentText && currentText === lastText) {
      if (!stableSince) {
        stableSince = now;
      }

      const stableDuration = now - stableSince;
      if (
        shouldFinalizeContent(
          generationActive,
          responseComplete,
          stableDuration,
          contentStableMs,
          contentStableWithActionsMs
        )
      ) {
        return currentText;
      }
    } else {
      lastText = currentText;
      stableSince = 0;
    }

    if (rawText && rawText === lastRawText) {
      if (!rawStableSince) {
        rawStableSince = now;
      }

      const rawStableDuration = now - rawStableSince;
      const rawRequiredStableMs = responseComplete
        ? contentStableWithActionsMs
        : contentStableMs;
      if (
        !currentText &&
        !generationActive &&
        rawStableDuration >= rawRequiredStableMs
      ) {
        const protocolContent = readProtocolContent(current);
        if (protocolContent && !isProtocolContentComplete(protocolContent)) {
          throw new Error(t("protocolIncomplete"));
        }
        if (responseComplete) {
          throw new Error(t("markdownMissing"));
        }
      }
    } else {
      lastRawText = rawText;
      rawStableSince = 0;
    }

    await sleep(500);
  }

  throw new Error(t("responseTimeoutDetails", [
    String(lastText.length),
    String(lastRawText.length),
    String(Boolean(target?.isConnected)),
  ]));
}

function findCurrentGeneratedMessage(element) {
  const target = getCurrentTargetMessage();
  if (target) {
    return target;
  }

  if (element?.isConnected && !activeInitialAssistantSet?.has(element)) {
    return element;
  }

  return null;
}

// Protocol-first extraction: core handles protocol detection, then delegates to adapter.
async function extractMessageTextWithProtocol(element) {
  if (!element) {
    return "";
  }

  const protocolContent = readProtocolContent(element);
  if (protocolContent) {
    return isProtocolContentComplete(protocolContent) ? protocolContent : "";
  }

  return adapter.extractMessageText(element);
}

function extractRawMessageText(element) {
  if (!element) {
    return "";
  }

  const clone = element.cloneNode(true);
  clone.querySelectorAll(`[${CARD_ATTRIBUTE}]`).forEach((node) => node.remove());
  return getElementText(clone).trim();
}

// Never finalize while the AI is still generating. Response action buttons can
// legitimately be visible mid-generation, so `responseComplete` alone is not safe.
function shouldFinalizeContent(
  generationActive,
  responseComplete,
  stableDuration,
  contentStableMs,
  contentStableWithActionsMs
) {
  if (generationActive) {
    return false;
  }

  const requiredStableMs = responseComplete
    ? contentStableWithActionsMs
    : contentStableMs;
  return stableDuration >= requiredStableMs;
}

// ---- Result delivery ----
async function deliverExtractionResult(result, runId = activeRunId) {
  if (!isActiveRun(runId)) {
    return false;
  }
  if (result) {
    pendingExtractionResult = result;
  }
  if (
    !activeJobId ||
    !pendingExtractionResult ||
    resultDeliveryStarted
  ) {
    return false;
  }

  resultDeliveryStarted = true;
  const resultToDeliver = pendingExtractionResult;
  const message = {
    type: "EXTRACTION_RESULT",
    payload: {
      jobId: activeJobId,
      ...resultToDeliver,
    },
  };

  try {
    const response = await sendRuntimeMessageWithRetry(message);
    if (response?.ignored || (response?.ok === false && !response?.task)) {
      updateMemoryCard({
        jobId: activeJobId,
        status: "error",
        statusMessage: response?.error || t("resultIgnored"),
      });
      resetActiveExtractionState(runId);
      return false;
    }
    resetActiveExtractionState(runId);
    return true;
  } catch (error) {
    resultDeliveryStarted = false;
    console.warn("Failed to deliver extraction result:", error);
    scheduleResultDeliveryRetry(runId);
    return false;
  }
}

function scheduleResultDeliveryRetry(runId) {
  clearTimeout(resultDeliveryRetryTimer);
  resultDeliveryRetryTimer = setTimeout(() => {
    deliverExtractionResult(undefined, runId).catch((error) => {
      console.warn("Extraction result retry failed:", error);
    });
  }, 2_000);
}

function resetActiveExtractionState(runId) {
  if (runId !== activeRunId) {
    return;
  }
  clearTimeout(resultDeliveryRetryTimer);
  clearTimeout(protocolDeliveryTimer);
  activeRunId += 1;
  extractionInProgress = false;
  activeJobId = null;
  activeInitialAssistantSet = null;
  activeBaselineProtocolContent = "";
  activeTargetMessage = null;
  resultDeliveryStarted = false;
  pendingExtractionResult = null;
}

function isActiveRun(runId) {
  return extractionInProgress && runId === activeRunId;
}

function assertActiveRun(runId) {
  if (!isActiveRun(runId)) {
    throw new Error(t("extractionCancelled"));
  }
}

async function sendRuntimeMessageWithRetry(message) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      lastError = error;
      await sleep(250 * (attempt + 1));
    }
  }

  throw lastError || new Error(t("resultDeliveryFailed"));
}

// ---- Protocol message observer ----
function collapseProtocolMessage(codeBlock) {
  if (!getElementText(codeBlock).includes(MEMORY_PROTOCOL_MARKER)) {
    return;
  }

  const message = adapter.getAssistantFromNode(codeBlock);
  if (!message || message.querySelector(`:scope > [${CARD_ATTRIBUTE}]`)) {
    return;
  }

  // The protocol marker is the first line of the code block, so it appears while
  // the memory is still streaming. If a job owns this message, the running task
  // owns the card lifecycle: painting it as "success" here would both lie to the
  // user and freeze every later status update via the success guard in
  // applyCardState().
  if (activeJobId && !activeInitialAssistantSet?.has(message)) {
    ensureMemoryCard(message, activeJobId, {
      status: "generating",
      statusMessage: buildGeneratingMessage(message),
    });
    return;
  }

  const protocolContent = readProtocolContent(message);
  if (!isProtocolContentComplete(protocolContent)) {
    return;
  }

  ensureMemoryCard(message, "restored", {
    status: "success",
    statusMessage: t("contentCollapsed"),
  });
}

function queueProtocolResultDelivery() {
  if (!activeJobId || !activeInitialAssistantSet) {
    return;
  }

  clearTimeout(protocolDeliveryTimer);
  protocolDeliveryTimer = setTimeout(() => {
    deliverCompletedProtocolResult().catch((error) => {
      console.warn("Protocol result delivery failed:", error);
    });
  }, 250);
}

async function deliverCompletedProtocolResult() {
  if (!activeJobId || resultDeliveryStarted) {
    return;
  }

  if (adapter.isGenerationActive()) {
    return;
  }

  const message = getCurrentTargetMessage();
  if (!message) {
    return;
  }

  if (!adapter.hasResponseActions(message)) {
    return;
  }

  const content = readProtocolContent(message);
  if (!isProtocolContentComplete(content)) {
    return;
  }

  updateMemoryCard({
    jobId: activeJobId,
    status: "saving",
    statusMessage: t("savingLocal"),
  });
  await deliverExtractionResult({
    ok: true,
    content: stripProtocolMarker(content),
    filename: extractProtocolFilename(content),
    title: adapter.getConversationTitle(),
    sourceUrl: location.href,
    siteId: adapter.siteId,
  });
}

function observeProtocolMessages() {
  const protocolSelector = adapter.protocolBlockSelector || "pre code";

  injectCardStyles();
  document.querySelectorAll(protocolSelector).forEach(collapseProtocolMessage);

  const observer = new MutationObserver((records) => {
    queueProtocolResultDelivery();

    for (const record of records) {
      if (record.type === "characterData") {
        const codeBlock = record.target.parentElement?.closest(protocolSelector);
        if (codeBlock) {
          collapseProtocolMessage(codeBlock);
        }
        continue;
      }

      for (const node of record.addedNodes) {
        if (node instanceof Text) {
          const codeBlock = node.parentElement?.closest(protocolSelector);
          if (codeBlock) {
            collapseProtocolMessage(codeBlock);
          }
          continue;
        }
        if (!(node instanceof Element)) {
          continue;
        }
        if (node.matches(protocolSelector)) {
          collapseProtocolMessage(node);
        }
        node.querySelectorAll?.(protocolSelector).forEach(collapseProtocolMessage);
      }
    }
  });

  observer.observe(document.body, {
    characterData: true,
    childList: true,
    subtree: true,
  });
}

function normalizeError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("Could not establish connection") || msg.includes("Receiving end does not exist")) {
    return t("communicationFailed");
  }
  return msg;
}

// Export engine API for content-entry.js
globalThis.ChatDistiller = globalThis.ChatDistiller || {};
globalThis.ChatDistiller.engine = {
  observeProtocolMessages,
};
})();
