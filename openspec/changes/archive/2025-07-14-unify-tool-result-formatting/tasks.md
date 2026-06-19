## 1. 新增 `src/ui/shared/tool-result-formatter.ts`

- [x] 创建文件，导出 `formatToolResultForUI(toolName: string, rawText: string): string`
- [x] 实现 `extractWriteSummary(text)` — `write_file`/`overwrite_file` 专用摘要提取
- [x] 实现 `switch` 分支：`write_file` → extractWriteSummary, `overwrite_file` → extractWriteSummary
- [x] 实现 `default` 分支：`raw.slice(0, 600) + "… (N more chars)"` 安全兜底
- [x] 添加单元测试（`tests/ui/tool-result-formatter.test.ts`）

## 2. 修改 `src/ui/web/web-backend.ts`（Live 路径）

- [x] import `formatToolResultForUI`
- [x] 在 `tool:end` 事件处理器（约 line 122）中：将 `e.result.slice(0, 5000)` 替换为 `formatToolResultForUI(e.name, rs)`，其中 `rs` 先按原有逻辑转为 string
- [x] 验证 `extractImagesFromToolResult` 仍然正常工作（在 formatter 之后调用）

## 3. 修改 `src/session/display.ts`（History 路径）

- [x] import `formatToolResultForUI`
- [x] 在 `extractToolResultText` 中：将刚添加的 `MAX_RESULT = 600` 截断逻辑替换为调用 `formatToolResultForUI`
- [x] **注意**：`extractToolResultText` 当前只知道 content blocks，不知道 toolName。需要将 toolName 传入该函数（修改调用链）

## 4. 传入 toolName 到 `extractToolResultText`

- [x] 在 `rebuildDisplayMessages` pass 1 中（约 line 132-145），匹配 toolResult 时已知 toolName（通过 `lastAssistantToolIds` 和 toolCallId 可以查到）
- [x] 将 toolName 与 result text 一起存入 `pendingResults`
- [x] 在 pass 2 中（约 line 204-212），使用 toolName 调用 `formatToolResultForUI`

## 5. 清理

- [x] 删除 `web-backend.ts` 中的 `slice(0, 5000)`（已被 formatter 替代）
- [x] 删除 `display.ts` 中的 `MAX_RESULT` 和内联截断逻辑（已被 formatter 替代）
- [x] 确认 `ToolCard.tsx` 的 `extractImages` 不受影响

## 6. 验证

- [x] `npx tsc --noEmit -p tsconfig.json` 通过
- [x] 现有测试通过：`npx vitest run`
- [x] 手动验证：加载 `00MQJG1XXV2TV4O3IDUCRT635J` session，确认 `write_file` 结果只显示摘要，UI 可正常滚动
- [x] 手动验证：执行一个新的 `write_file`，确认 live 路径也正确格式化
