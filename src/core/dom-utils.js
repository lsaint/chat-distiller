(() => {
const { t } = globalThis.ChatDistillerI18n;
function getElementText(element) {
  const codeMirrorLines = element?.querySelectorAll?.(".cm-line") || [];
  if (codeMirrorLines.length > 0) {
    return Array.from(codeMirrorLines, (line) => line.textContent || "").join(
      "\n",
    );
  }

  return element?.textContent || element?.innerText || "";
}

function getVisibleElementText(element) {
  return element?.innerText || element?.textContent || "";
}

function isVisible(element) {
  if (!element || !element.isConnected) {
    return false;
  }
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility({
      checkOpacity: false,
      checkVisibilityCSS: true,
    });
  }
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden"
  );
}

// Returns the text of the longest matching code block, trimmed. Single pass:
// sorting would re-read every block's text on each comparison.
function getLongestCodeText(root, selector = "pre code") {
  const blocks = root?.querySelectorAll?.(selector) || [];
  let longest = "";
  for (let i = 0; i < blocks.length; i += 1) {
    const text = getElementText(blocks[i]).trim();
    if (text.length > longest.length) {
      longest = text;
    }
  }
  return longest;
}

async function waitForElement(finder, timeoutMs) {
  const timeoutAt = Date.now() + timeoutMs;

  while (Date.now() < timeoutAt) {
    const element = finder();
    if (element) {
      return element;
    }
    await sleep(200);
  }

  throw new Error(t("requiredElementMissing"));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

globalThis.ChatDistiller = globalThis.ChatDistiller || {};
globalThis.ChatDistiller.dom = {
  getElementText,
  getVisibleElementText,
  getLongestCodeText,
  isVisible,
  waitForElement,
  sleep,
};
})();
