(() => {
const { t } = globalThis.ChatDistillerI18n;
const CARD_ATTRIBUTE = "data-chat-distiller-card";
const COLLAPSED_ATTRIBUTE = "data-chat-distiller-collapsed";
const PROMPT_COLLAPSED_ATTRIBUTE = "data-chat-distiller-prompt-collapsed";

// Adapter hooks — injected via configureCardUi() by engine.js at boot.
// Defaults are identity/null so that card-ui.js never reads ChatDistiller.adapter directly.
let resolveCardMountPoint = (el) => el;
let resolveCollapseTarget = (el) => el;
let resolvePromptTurn = null;
let runTaskAction = null;

function configureCardUi(options = {}) {
  if (options.resolveCardMountPoint) resolveCardMountPoint = options.resolveCardMountPoint;
  if (options.resolveCollapseTarget) resolveCollapseTarget = options.resolveCollapseTarget;
  if (options.resolvePromptTurn) resolvePromptTurn = options.resolvePromptTurn;
  if (options.runTaskAction) runTaskAction = options.runTaskAction;
}

function setMemoryTurnCollapsed(assistantElement, collapsed) {
  const collapseTarget = resolveCollapseTarget(assistantElement);
  collapseTarget.setAttribute(COLLAPSED_ATTRIBUTE, String(collapsed));

  const promptTurn = resolvePromptTurn ? resolvePromptTurn(assistantElement) : null;
  if (promptTurn) {
    promptTurn.setAttribute(PROMPT_COLLAPSED_ATTRIBUTE, String(collapsed));
  }
}

function setPromptTurnCollapsed(promptElement, collapsed) {
  if (!promptElement) {
    return;
  }
  promptElement.setAttribute(PROMPT_COLLAPSED_ATTRIBUTE, String(collapsed));
}

function setMemoryTurnCollapseLocked(assistantElement, locked) {
  const mountPoint = resolveCardMountPoint(assistantElement);
  const toggle = mountPoint.querySelector(
    `:scope > [${CARD_ATTRIBUTE}] [data-role="collapse-toggle"]`,
  );
  if (toggle) {
    toggle.disabled = locked;
  }
}

function getBrandIconUrl() {
  if (typeof globalThis.chrome !== "undefined" && globalThis.chrome?.runtime?.getURL) {
    return globalThis.chrome.runtime.getURL("icons/icon-32.png");
  }
  return "";
}

function ensureMemoryCard(element, jobId, task = {}) {
  if (!element) {
    return null;
  }

  injectCardStyles();

  const mountPoint = resolveCardMountPoint(element);
  const collapseTarget = resolveCollapseTarget(element);

  let card = mountPoint.querySelector(`:scope > [${CARD_ATTRIBUTE}]`);
  if (!card) {
    card = document.createElement("div");
    card.setAttribute(CARD_ATTRIBUTE, "");
    card.dataset.jobId = jobId || "restored";
    card.setAttribute("role", "status");

    const statusGroup = document.createElement("div");
    statusGroup.className = "chat-distiller-card-header";

    const iconUrl = getBrandIconUrl();
    if (iconUrl) {
      const brandIcon = document.createElement("img");
      brandIcon.className = "chat-distiller-brand-icon";
      brandIcon.src = iconUrl;
      brandIcon.alt = "Chat Distiller";
      brandIcon.setAttribute("aria-hidden", "true");
      statusGroup.append(brandIcon);
    }

    const status = document.createElement("span");
    status.dataset.role = "status";
    status.textContent = t("generatingMemory");
    statusGroup.append(status);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.dataset.role = "collapse-toggle";
    toggle.textContent = collapseTarget.getAttribute(COLLAPSED_ATTRIBUTE) === "false"
      ? t("collapseContent")
      : t("expandContent");
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isCollapsed = collapseTarget.getAttribute(COLLAPSED_ATTRIBUTE) !== "false";
      setMemoryTurnCollapsed(element, !isCollapsed);
      toggle.textContent = isCollapsed
        ? t("collapseContent")
        : t("expandContent");
    });

    const taskAction = document.createElement("button");
    taskAction.type = "button";
    taskAction.dataset.role = "task-action";
    taskAction.hidden = true;
    taskAction.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!runTaskAction || !card.chatDistillerTask) {
        return;
      }
      taskAction.disabled = true;
      try {
        await runTaskAction(card.chatDistillerTask);
      } finally {
        taskAction.disabled = false;
      }
    });

    card.append(statusGroup, taskAction, toggle);
    mountPoint.append(card);
  } else {
    let statusGroup = card.querySelector(".chat-distiller-card-header");
    const status = card.querySelector('[data-role="status"]');
    if (!statusGroup && status) {
      statusGroup = document.createElement("div");
      statusGroup.className = "chat-distiller-card-header";
      status.before(statusGroup);
      statusGroup.append(status);
    }
    if (statusGroup && !statusGroup.querySelector(".chat-distiller-brand-icon")) {
      const iconUrl = getBrandIconUrl();
      if (iconUrl) {
        const brandIcon = document.createElement("img");
        brandIcon.className = "chat-distiller-brand-icon";
        brandIcon.src = iconUrl;
        brandIcon.alt = "Chat Distiller";
        brandIcon.setAttribute("aria-hidden", "true");
        statusGroup.prepend(brandIcon);
      }
    }
  }

  if (jobId && jobId !== "restored") {
    // A card created by the history-restore path starts out as "success". When a
    // real job takes it over, drop that status so applyCardState() is allowed to
    // move the card through generating -> saving -> success.
    if (card.dataset.jobId !== jobId) {
      delete card.dataset.status;
    }
    card.dataset.jobId = jobId;
  }
  if (!collapseTarget.hasAttribute(COLLAPSED_ATTRIBUTE)) {
    setMemoryTurnCollapsed(element, task.initiallyCollapsed !== false);
  } else {
    setMemoryTurnCollapsed(
      element,
      collapseTarget.getAttribute(COLLAPSED_ATTRIBUTE) !== "false"
    );
  }
  const toggle = card.querySelector('[data-role="collapse-toggle"]');
  if (toggle) {
    toggle.textContent =
      collapseTarget.getAttribute(COLLAPSED_ATTRIBUTE) === "false"
        ? t("collapseContent")
        : t("expandContent");
    toggle.disabled = task.collapseLocked === true;
  }
  applyCardState(card, task);
  return card;
}

function updateMemoryCard(task = {}) {
  if (!task.jobId) {
    return;
  }

  for (const card of document.querySelectorAll(`[${CARD_ATTRIBUTE}]`)) {
    if (card.dataset.jobId === task.jobId) {
      applyCardState(card, task);
    }
  }
}

function applyCardState(card, task) {
  const statusElement = card.querySelector('[data-role="status"]');
  if (!statusElement) {
    return;
  }

  if (card.dataset.status === "success" && task.status !== "success") {
    return;
  }

  const nextText = task.statusMessage || t("generatingMemory");
  const nextStatus = task.status || "generating";
  card.chatDistillerTask = task;

  // Skip no-op writes: the polling loop refreshes this card twice per second, and
  // every needless DOM write feeds the MutationObserver and resets the delivery
  // debounce timer.
  if (statusElement.textContent !== nextText) {
    statusElement.textContent = nextText;
  }
  if (card.dataset.status !== nextStatus) {
    card.dataset.status = nextStatus;
  }

  const taskAction = card.querySelector('[data-role="task-action"]');
  if (taskAction) {
    const requiresAuthorization = task.status === "awaiting_permission" &&
      task.canRetrySave;
    const canRetry = task.status === "error" && task.canRetrySave;
    taskAction.hidden = !requiresAuthorization && !canRetry;
    if (requiresAuthorization) {
      taskAction.textContent = t("authorizeAndSave");
    } else if (canRetry) {
      taskAction.textContent = t("retrySaveCard");
    }
  }
}

function injectCardStyles() {
  if (document.querySelector("#chat-distiller-card-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "chat-distiller-card-styles";
  style.textContent = `
    [${COLLAPSED_ATTRIBUTE}="true"] > :not([${CARD_ATTRIBUTE}]) {
      display: none !important;
    }
    [${PROMPT_COLLAPSED_ATTRIBUTE}="true"] {
      display: none !important;
    }
    [${CARD_ATTRIBUTE}] {
      display: flex !important;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
      border-radius: 10px;
      background: color-mix(in srgb, currentColor 5%, transparent);
      font-size: 13px;
      line-height: 1.45;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-card-header {
      display: flex;
      align-items: center;
      min-width: 0;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-brand-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      object-fit: contain;
      display: block;
      margin-right: 1ch;
    }
    [${CARD_ATTRIBUTE}][data-status="success"] {
      color: #137333;
    }
    [${CARD_ATTRIBUTE}][data-status="error"],
    [${CARD_ATTRIBUTE}][data-status="awaiting_permission"] {
      color: #b3261e;
    }
    [${CARD_ATTRIBUTE}] button {
      flex: none;
      border: 0;
      padding: 4px 7px;
      border-radius: 6px;
      color: inherit;
      background: color-mix(in srgb, currentColor 10%, transparent);
      cursor: pointer;
      font: inherit;
      font-size: 12px;
    }
  `;
  document.documentElement.append(style);
}

globalThis.ChatDistiller = globalThis.ChatDistiller || {};
globalThis.ChatDistiller.cardUi = {
  CARD_ATTRIBUTE,
  COLLAPSED_ATTRIBUTE,
  PROMPT_COLLAPSED_ATTRIBUTE,
  configureCardUi,
  setPromptTurnCollapsed,
  setMemoryTurnCollapsed,
  setMemoryTurnCollapseLocked,
  ensureMemoryCard,
  updateMemoryCard,
  applyCardState,
  injectCardStyles,
};
})();
