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
let getMarkdownDocument = null;
let runCopyMarkdown = null;
let runSaveAs = null;
let closeActivePreview = null;

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !closeActivePreview) {
    return;
  }
  event.preventDefault();
  closeActivePreview({ restoreFocus: true });
});

function configureCardUi(options = {}) {
  if (options.resolveCardMountPoint) resolveCardMountPoint = options.resolveCardMountPoint;
  if (options.resolveCollapseTarget) resolveCollapseTarget = options.resolveCollapseTarget;
  if (options.resolvePromptTurn) resolvePromptTurn = options.resolvePromptTurn;
  if (options.runTaskAction) runTaskAction = options.runTaskAction;
  if (options.getMarkdownDocument) getMarkdownDocument = options.getMarkdownDocument;
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
    `:scope > [${CARD_ATTRIBUTE}] [data-role="preview-markdown"]`,
  );
  if (toggle) {
    toggle.disabled = locked;
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";

function createPreviewSvg() {
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
  path.setAttribute("d", "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z");
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "2.5");
  svg.append(path, circle);
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

function createPreviewButton(card, element) {
  const control = document.createElement("div");
  control.className = "chat-distiller-preview-control";
  control.dataset.role = "preview-control";
  control.hidden = true;
  const button = createIconButton({
    role: "preview-markdown",
    tooltip: t("previewMarkdown"),
    svg: createPreviewSvg(),
  });
  const popover = document.createElement("div");
  popover.className = "chat-distiller-markdown-preview";

  const content = document.createElement("pre");
  content.dataset.role = "preview-content";
  content.tabIndex = 0;
  const expand = document.createElement("button");
  expand.type = "button";
  expand.dataset.role = "expand-preview";
  expand.textContent = t("expandPreview");
  expand.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const expanded = popover.dataset.expanded === "true";
    popover.dataset.expanded = String(!expanded);
    expand.textContent = expanded ? t("expandPreview") : t("closePreview");
    if (expanded) expand.focus({ preventScroll: true });
  });
  popover.append(content, expand);
  control.append(button, popover);

  const refresh = () => {
    const markdown = getMarkdownDocument?.(card.chatDistillerTask, element);
    content.textContent = markdown?.content || t("markdownMissing");
  };
  enableTransientScrollbar(content);
  enableTransientScrollbar(popover);
  const closePreview = ({ restoreFocus = false } = {}) => {
    clearTimeout(control._closeTimer);
    control.classList.remove("is-open");
    delete popover.dataset.expanded;
    expand.textContent = t("expandPreview");
    if (closeActivePreview === closePreview) {
      closeActivePreview = null;
    }
    if (restoreFocus && document.activeElement !== button) {
      control._suppressFocusOpen = true;
      button.focus({ preventScroll: true });
    }
  };
  const showPreview = (event) => {
    if (event?.type === "focusin" && control._suppressFocusOpen) {
      control._suppressFocusOpen = false;
      return;
    }
    if (closeActivePreview && closeActivePreview !== closePreview) {
      closeActivePreview();
    }
    clearTimeout(control._closeTimer);
    refresh();
    control.classList.add("is-open");
    closeActivePreview = closePreview;
  };
  const hidePreview = () => {
    clearTimeout(control._closeTimer);
    control._closeTimer = setTimeout(closePreview, 200);
  };
  const handleMouseEnter = (event) => {
    if (document.activeElement === expand) expand.blur();
    showPreview(event);
  };
  control._closePreview = closePreview;
  control.addEventListener("mouseenter", handleMouseEnter);
  control.addEventListener("focusin", showPreview);
  control.addEventListener("focusout", (event) => {
    if (!control.contains(event.relatedTarget)) hidePreview();
  });
  control.addEventListener("mouseleave", () => {
    if (!control.contains(document.activeElement)) hidePreview();
  });
  return control;
}

function enableTransientScrollbar(element) {
  element.addEventListener("scroll", () => {
    element.classList.add("is-scrolling");
    clearTimeout(element._scrollbarTimer);
    element._scrollbarTimer = setTimeout(() => {
      element.classList.remove("is-scrolling");
    }, 600);
  });
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
      createPreviewButton(card, element),
      createCopyMarkdownButton(card, element),
      createSaveAsButton(card, element),
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
  const preview = card.querySelector('[data-role="preview-markdown"]');
  if (preview) preview.disabled = task.collapseLocked === true;
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
  const previewControl = card.querySelector('[data-role="preview-control"]');
  if (previewControl) {
    const hidden = isGenerating || !hasMemoryToSave;
    if (hidden) previewControl._closePreview?.();
    previewControl.hidden = hidden;
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
    [${CARD_ATTRIBUTE}] [data-role="preview-markdown"],
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
    [${CARD_ATTRIBUTE}] [data-role="preview-markdown"] > svg,
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
    [${CARD_ATTRIBUTE}] .chat-distiller-preview-control {
      position: relative;
      display: flex;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-preview-control::before {
      content: "";
      display: none;
      position: absolute;
      z-index: 1000;
      right: 0;
      bottom: 100%;
      width: min(520px, calc(100vw - 32px));
      height: 18px;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-preview-control.is-open::before {
      display: block;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-preview-control.is-open [data-role="preview-markdown"]::after {
      display: none;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview {
      display: none;
      position: absolute;
      z-index: 1001;
      right: 0;
      bottom: calc(100% + 18px);
      width: min(520px, calc(100vw - 32px));
      max-height: 350px;
      overflow: hidden;
      box-sizing: border-box;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      color: #f1f3f4;
      background: #202124;
      text-align: left;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.32);
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-preview-control.is-open .chat-distiller-markdown-preview {
      display: block;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview[data-expanded="true"] {
      position: fixed;
      inset: 24px;
      width: auto;
      max-height: none;
      overflow: auto;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview pre {
      margin: 0 0 10px;
      max-height: 270px;
      overflow-x: hidden;
      overflow-y: auto;
      color: inherit;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview,
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview pre {
      scrollbar-color: transparent transparent;
      scrollbar-width: none;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview.is-scrolling,
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview pre.is-scrolling {
      scrollbar-color: rgba(255, 255, 255, 0.48) transparent;
      scrollbar-width: thin;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview::-webkit-scrollbar,
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview pre::-webkit-scrollbar {
      width: 0;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview.is-scrolling::-webkit-scrollbar,
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview pre.is-scrolling::-webkit-scrollbar {
      width: 5px;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview::-webkit-scrollbar-track,
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview pre::-webkit-scrollbar-track {
      background: transparent;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview::-webkit-scrollbar-thumb,
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview pre::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.48);
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview[data-expanded="true"] pre {
      max-height: none;
      overflow: visible;
    }
    [${CARD_ATTRIBUTE}] .chat-distiller-markdown-preview [data-role="expand-preview"] {
      width: 100%;
      height: auto;
      padding: 7px 10px;
      color: #202124;
      background: #f1f3f4;
    }
    [${CARD_ATTRIBUTE}] [hidden] {
      display: none !important;
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
