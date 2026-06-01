## 1. 客户端改动

- [x] 1.1 `MessageInput.tsx`: 移除 `handleSubmit` 中 `startsWith("/")` 的 slash command 路由分支，所有文本统一走 `onSend`（`chat` 通道）
- [x] 1.2 确认 `showSlashMenu` 逻辑不受影响——输入 `/` 时补全菜单仍弹出
- [x] 1.3 确认 `/` 开头的输入提交后输入框正常清空、菜单正常关闭

## 2. 服务端改动

- [x] 2.1 `commands.ts`: `executeSlashCommand` 返回值从 `void` 改为 `boolean`（找到命令并执行 → `true`，未找到 → `false`）
- [x] 2.2 `web-backend.ts` chat handler: `startsWith("/")` 改为「首词匹配已知命令」检查，从 `getSlashCommandAutocomplete()` 获取已知命令名列表
- [x] 2.3 `web-backend.ts` chat handler: 匹配失败时走正常 chat 流程（`resolveAtFileRefs` + `harness.promptAndSave`），不报错
- [x] 2.4 `web-backend.ts` `handleSlashCommand`: 处理 `executeSlashCommand` 返回 `false` 的情况——fallback 为 chat 消息发给 AI
- [x] 2.5 TUI 端 `tui-app.ts`: 适配 `executeSlashCommand` 的新返回值，TUI 模式下保持 "Unknown command" 报错

## 3. 验证

- [x] 3.1 手动测试：Web UI 输入 `/help` → 正常显示帮助
- [x] 3.2 手动测试：Web UI 输入 `/config model xxx` → 正常切换模型
- [x] 3.3 手动测试：Web UI 输入 `/Users/foo/bar.ts` → 作为聊天消息发给 AI，不报错
- [x] 3.4 手动测试：Web UI 输入 `/randomstuff` → 作为聊天消息发给 AI，不报错
- [x] 3.5 确认 slash 补全菜单（输入 `/` 时弹出）行为不变
