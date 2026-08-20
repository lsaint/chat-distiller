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
let runCopyMarkdown = null;
let runSaveAs = null;

function configureCardUi(options = {}) {
  if (options.resolveCardMountPoint) resolveCardMountPoint = options.resolveCardMountPoint;
  if (options.resolveCollapseTarget) resolveCollapseTarget = options.resolveCollapseTarget;
  if (options.resolvePromptTurn) resolvePromptTurn = options.resolvePromptTurn;
  if (options.runTaskAction) runTaskAction = options.runTaskAction;
  if (options.runCopyMarkdown) runCopyMarkdown = options.runCopyMarkdown;
  if (options.runSaveAs) runSaveAs = options.runSaveAs;
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

const SVG_NS = "http://www.w3.org/2000/svg";

function createDoubleChevronSvg(direction) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS(SVG_NS, "path");
  if (direction === "up") {
    path.setAttribute("d", "M7 11L12 6L17 11 M7 18L12 13L17 18");
  } else {
    path.setAttribute("d", "M7 6L12 11L17 6 M7 13L12 18L17 13");
  }
  svg.append(path);
  return svg;
}

function createCopySvg() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("width", "14");
  rect.setAttribute("height", "14");
  rect.setAttribute("x", "8");
  rect.setAttribute("y", "8");
  rect.setAttribute("rx", "2");
  rect.setAttribute("ry", "2");

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute(
    "d",
    "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
  );

  svg.append(rect, path);
  return svg;
}

function createCheckSvg() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const polyline = document.createElementNS(SVG_NS, "polyline");
  polyline.setAttribute("points", "20 6 9 17 4 12");
  svg.append(polyline);
  return svg;
}

function createSaveAsSvg() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute(
    "d",
    "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z",
  );
  const polyline1 = document.createElementNS(SVG_NS, "polyline");
  polyline1.setAttribute("points", "17 21 17 13 7 13 7 21");
  const polyline2 = document.createElementNS(SVG_NS, "polyline");
  polyline2.setAttribute("points", "7 3 7 8 15 8");

  svg.append(path, polyline1, polyline2);
  return svg;
}

function updateCollapseToggle(toggle, isCollapsed) {
  if (!toggle) {
    return;
  }
  const label = isCollapsed ? t("expandContent") : t("collapseContent");
  toggle.dataset.tooltip = label;
  toggle.setAttribute("aria-label", label);
  toggle.removeAttribute("title");
  toggle.replaceChildren(createDoubleChevronSvg(isCollapsed ? "up" : "down"));
}

function createIconButton({ role, tooltip, svg, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.role = role;
  button.className = "chat-distiller-icon-button";
  if (tooltip) {
    button.dataset.tooltip = tooltip;
    button.setAttribute("aria-label", tooltip);
  }
  if (svg) {
    button.append(svg);
  }
  if (onClick) {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await onClick(event, button);
    });
  }
  return button;
}

function flashButtonState(
  btn,
  { tooltip, svg, revertTooltip, revertSvg, delay = 1500 },
) {
  btn.dataset.tooltip = tooltip;
  btn.setAttribute("aria-label", tooltip);
  if (svg) {
    btn.replaceChildren(svg);
  }
  clearTimeout(btn._resetTimer);
  btn._resetTimer = setTimeout(() => {
    btn.dataset.tooltip = revertTooltip;
    btn.setAttribute("aria-label", revertTooltip);
    if (revertSvg) {
      btn.replaceChildren(revertSvg());
    }
  }, delay);
}

function createCopyMarkdownButton(card, element) {
  const button = createIconButton({
    role: "copy-markdown",
    tooltip: t("copyMarkdown"),
    svg: createCopySvg(),
    onClick: async (_event, btn) => {
      if (!runCopyMarkdown) return;
      try {
        const res = await runCopyMarkdown(card.chatDistillerTask, element);
        if (res?.ok) {
          flashButtonState(btn, {
            tooltip: t("copied"),
            svg: createCheckSvg(),
            revertTooltip: t("copyMarkdown"),
            revertSvg: createCopySvg,
            delay: 1500,
          });
        } else {
          flashButtonState(btn, {
            tooltip: res?.error || t("taskError"),
            revertTooltip: t("copyMarkdown"),
            delay: 2500,
          });
        }
      } catch (err) {
        flashButtonState(btn, {
          tooltip: err?.message || t("taskError"),
          revertTooltip: t("copyMarkdown"),
          delay: 2500,
        });
      }
    },
  });
  button.hidden = true;
  return button;
}

function createSaveAsButton(card, element) {
  const button = createIconButton({
    role: "save-as",
    tooltip: t("saveAs"),
    svg: createSaveAsSvg(),
    onClick: async (_event, btn) => {
      if (!runSaveAs) return;
      try {
        const res = await runSaveAs(card.chatDistillerTask, element);
        if (res?.ok) {
          flashButtonState(btn, {
            tooltip: t("savedAs"),
            svg: createCheckSvg(),
            revertTooltip: t("saveAs"),
            revertSvg: createSaveAsSvg,
            delay: 1500,
          });
        } else if (!res?.cancelled) {
          flashButtonState(btn, {
            tooltip: res?.error || t("taskError"),
            revertTooltip: t("saveAs"),
            delay: 2500,
          });
        }
      } catch (err) {
        flashButtonState(btn, {
          tooltip: err?.message || t("taskError"),
          revertTooltip: t("saveAs"),
          delay: 2500,
        });
      }
    },
  });
  button.hidden = true;
  return button;
}

function createCollapseToggleButton(element, collapseTarget) {
  const button = createIconButton({
    role: "collapse-toggle",
    onClick: () => {
      const isCollapsed =
        collapseTarget.getAttribute(COLLAPSED_ATTRIBUTE) !== "false";
      setMemoryTurnCollapsed(element, !isCollapsed);
      updateCollapseToggle(button, !isCollapsed);
    },
  });
  updateCollapseToggle(
    button,
    collapseTarget.getAttribute(COLLAPSED_ATTRIBUTE) !== "false",
  );
  return button;
}

function createTaskActionButton(card) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.role = "task-action";
  button.hidden = true;
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!runTaskAction || !card.chatDistillerTask) {
      return;
    }
    button.disabled = true;
    try {
      await runTaskAction(card.chatDistillerTask);
    } finally {
      button.disabled = false;
    }
  });
  return button;
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

    const actionsGroup = document.createElement("div");
    actionsGroup.className = "chat-distiller-card-actions";
    actionsGroup.append(
      createTaskActionButton(card),
      createCopyMarkdownButton(card, element),
      createSaveAsButton(card, element),
      createCollapseToggleButton(element, collapseTarget),
    );

    card.append(statusGroup, actionsGroup);
    mountPoint.append(card);
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
    updateCollapseToggle(
      toggle,
      collapseTarget.getAttribute(COLLAPSED_ATTRIBUTE) !== "false"
    );
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

  const isGenerating = !task.status || task.status === "generating" || task.status === "saving";
  const hasMemoryToSave =
    task.status === "success" ||
    task.canRetrySave ||
    Boolean(task.result?.content);

  const copyMarkdown = card.querySelector('[data-role="copy-markdown"]');
  if (copyMarkdown) {
    copyMarkdown.hidden = isGenerating || !hasMemoryToSave;
  }

  const saveAs = card.querySelector('[data-role="save-as"]');
  if (saveAs) {
    saveAs.hidden = isGenerating || !hasMemoryToSave;
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
    [${CARD_ATTRIBUTE}] .chat-distiller-card-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
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
    [${CARD_ATTRIBUTE}] .chat-distiller-icon-button,
    [${CARD_ATTRIBUTE}] [data-role="collapse-toggle"],
    [${CARD_ATTRIBUTE}] [data-role="copy-markdown"],
    [${CARD_ATTRIBUTE}] [data-role="save-as"] {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      width: 24px;
      height: 24px;
      box-sizing: border-box;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-icon-button svg,
    [${CARD_ATTRIBUTE}] [data-role="collapse-toggle"] svg,
    [${CARD_ATTRIBUTE}] [data-role="copy-markdown"] svg,
    [${CARD_ATTRIBUTE}] [data-role="save-as"] svg {
      width: 16px;
      height: 16px;
      display: block;
      flex-shrink: 0;
    }
    [${CARD_ATTRIBUTE}] [data-tooltip] {
      position: relative;
    }
    [${CARD_ATTRIBUTE}] [data-tooltip]:hover::after,
    [${CARD_ATTRIBUTE}] [data-tooltip]:focus-visible::after {
      content: attr(data-tooltip);
      position: absolute;
      z-index: 1000;
      right: 0;
      bottom: calc(100% + 6px);
      padding: 6px 8px;
      border-radius: 5px;
      color: #ffffff;
      background: #3c4043;
      font-size: 12px;
      font-weight: normal;
      line-height: 1.3;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
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
