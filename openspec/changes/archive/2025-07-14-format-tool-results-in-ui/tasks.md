## 1. 增强 `formatToolResultForUI` 内容感知格式化

- [x] 1.1 添加 `isJSON(text)` helper — 检测 `{` / `[` 开头 + `JSON.parse` 成功
- [x] 1.2 添加 `formatCodeBlock(text, lang?)` helper — 将文本包入 ```` ```lang ```` code fence
- [x] 1.3 扩展 `switch` 分支：`bash` → ```` ```sh ````，`grep` → JSON 检测 + code fence，`glob` → 同 grep，`read_file` → ```` ``` ````
- [x] 1.4 在 `default` 分支添加 JSON 检测兜底：有效 JSON → ```` ```json ```` + pretty-print
- [x] 1.5 确保 `write_file` / `overwrite_file` 不受影响（仍走 `extractWriteSummary`）

## 2. 更新测试

- [x] 2.1 添加 JSON 检测 + pretty-print 的测试用例
- [x] 2.2 添加 `bash` / `grep` / `glob` / `read_file` code fence 测试用例
- [x] 2.3 添加 `default` JSON 兜底测试用例
- [x] 2.4 确保 `write_file` 现有测试仍然通过
- [x] 2.5 运行 `npx vitest run` 确认全部通过

## 3. ToolCard 改用 Markdown 渲染

- [x] 3.1 在 `ToolCard.tsx` 中 import `<Markdown>` 组件
- [x] 3.2 将结果体 `displayText` 的渲染从纯 `<span>` 改为 `<Markdown className="text-xs">`
- [x] 3.3 去掉结果容器的 `font-mono break-all whitespace-pre-wrap`（Markdown 自行处理排版）
- [x] 3.4 保留 `max-h-40 overflow-y-auto` 作为滚动防御

## 4. 验证

- [x] 4.1 `npx tsc --noEmit -p tsconfig.json` 通过
- [x] 4.2 `npx vitest run` 通过
- [x] 4.3 手动验证：执行 `bash` 工具，确认结果有代码块样式
- [x] 4.4 手动验证：执行 `grep` 工具（JSON 输出），确认 JSON 被 pretty-print + 语法高亮
- [x] 4.5 手动验证：加载历史 session，确认 History 路径也正确格式化
- [x] 4.6 手动验证：`write_file` 结果仍显示摘要（不受影响）
- [x] 4.7 手动验证：ToolCard 卡片布局和 session 主界面结构未变化
