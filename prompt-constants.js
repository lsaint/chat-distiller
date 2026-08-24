(() => {
  const EN_LOCALE = "en";
  const ZH_LOCALE = "zh_CN";

  const DEFAULT_PROMPTS = Object.freeze({
    [EN_LOCALE]: `Distill the complete current conversation into one atomic Memory note.

Content requirements:
- Keep only durable context, conclusions, decisions, constraints, and follow-up actions
- Remove repetition, temporary exploration, failed attempts, and rejected approaches
- Do not add update_time, created_at, updated_at, or any other generated timestamp
- Write in English
- Only add Obsidian-style [[wikilinks]] for core entities worth long-term reuse, quality over quantity
- Produce plain Markdown content`,
    [ZH_LOCALE]: `请将当前完整对话整理为一份原子 Memory 笔记。

内容要求：
- 只保留具有长期价值的背景、结论、决策、约束和后续行动
- 删除重复内容、临时探索、无效尝试和已经否定的方案
- 文件开头及正文都不要添加 update_time、created_at、updated_at 或其他生成时间戳
- 使用简体中文
- 仅为值得长期复用的核心实体添加 Obsidian式的 [[双向链接]]，宁缺毋滥。
- 文件内容为纯 Markdown`,
  });

  globalThis.ChatDistillerPromptConstants = Object.freeze({
    DEFAULT_PROMPTS,
  });
})();
