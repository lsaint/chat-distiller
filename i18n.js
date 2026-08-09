(() => {
  const EN_LOCALE = "en";
  const ZH_LOCALE = "zh_CN";
  const { DEFAULT_PROMPTS } = globalThis.ChatDistillerPromptConstants;

  const OUTPUT_PROTOCOL_SUFFIXES = {
    [EN_LOCALE]: `The following output protocol has the highest priority and must be followed exactly:
- The final answer must contain exactly one markdown code block fenced with four backticks
- Both the opening and closing outer fences must use exactly four backticks
- Use three backticks for code blocks inside the note
- The first line inside the outer code block must be: <!-- chat-distiller:v1 -->
- The next line must be an English filename comment in this format: <!-- filename: topic-name.md -->
- Replace topic-name.md with an accurate English filename describing the note
- The filename may contain only lowercase English letters, numbers, and hyphens
- Put a level-one heading on the first line after the filename comment
- The last line inside the outer code block must be: <!-- /chat-distiller:v1 -->
- Do not add update_time, created_at, updated_at, or any other generated timestamp
- Do not create attachments, Canvas, Artifacts, downloadable files, or file links
- Do not add any text outside the outer code block`,
    [ZH_LOCALE]: `以下输出协议优先级最高，必须严格遵守：
- 最终回答只能包含一个使用四个反引号围栏、标注为 markdown 的代码块
- 外层代码块的开始和结束围栏都必须恰好使用四个反引号
- 正文内部的代码块使用三个反引号
- 外层代码块第一行必须是：<!-- chat-distiller:v1 -->
- 开始标记后的第一行必须是英文文件名注释，格式示例：<!-- filename: topic-name.md -->
- topic-name.md 只是格式示例，必须替换为准确概括笔记主题的英文文件名
- 文件名只能使用小写英文字母、数字和连字符
- 文件名注释之后的第一行使用一级标题
- 外层代码块最后一行必须是：<!-- /chat-distiller:v1 -->
- 文件开头及正文都不要添加 update_time、created_at、updated_at 或其他生成时间戳
- 不要创建附件、Canvas、Artifact、下载文件或文件链接
- 不要在外层代码块之外添加任何文字`,
  };

  function getLocale() {
    return /^zh(?:[-_]|$)/i.test(chrome.i18n.getUILanguage())
      ? ZH_LOCALE
      : EN_LOCALE;
  }

  function t(key, substitutions) {
    const message = chrome.i18n.getMessage(key, substitutions);
    return message || key;
  }

  function localizeDocument(root = document) {
    root.documentElement.lang = getLocale() === ZH_LOCALE ? "zh-CN" : "en";
    root.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
  }

  function getDefaultPrompt(locale = getLocale()) {
    return DEFAULT_PROMPTS[locale] || DEFAULT_PROMPTS[EN_LOCALE];
  }

  function getOutputProtocolSuffix(locale = getLocale()) {
    return OUTPUT_PROTOCOL_SUFFIXES[locale] || OUTPUT_PROTOCOL_SUFFIXES[EN_LOCALE];
  }

  function isDefaultPrompt(prompt) {
    return Object.values(DEFAULT_PROMPTS).includes(prompt);
  }

  globalThis.ChatDistillerI18n = Object.freeze({
    getDefaultPrompt,
    getLocale,
    getOutputProtocolSuffix,
    isDefaultPrompt,
    localizeDocument,
    t,
  });
})();
