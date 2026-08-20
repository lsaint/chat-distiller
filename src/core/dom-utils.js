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
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden"
  );
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
  isVisible,
  waitForElement,
  sleep,
};
})();
