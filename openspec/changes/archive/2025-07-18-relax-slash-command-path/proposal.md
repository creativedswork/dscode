## Why

当前 slash command 检测使用简单的「以 `/` 开头且不含空格」启发式规则，导致 Unix 绝对路径（如 `/Users/foo/bar.ts`）被误判为 slash command 并报错 "Unknown command"。用户在 Web UI 中拖入文件路径或手打绝对路径时频繁踩坑。需要将判错改为静默 fallback：已知命令正常执行，不认识的输入直接当聊天消息发给 AI。

## What Changes

- **MessageInput.tsx**: `handleSubmit` 中移除 `startsWith("/")` 的特殊路由逻辑，所有输入统一走 `chat` 通道，让服务端决定是否为 slash command。`/` 输入时的 slash 补全菜单（`showSlashMenu`）保持不变。
- **web-backend.ts**: `handleMessage` 的 `chat` 分支中，将盲目的 `startsWith("/")` 替换为「首词匹配已知命令」检查。只有确认为已知命令时才走 `handleSlashCommand`，其余当正常聊天处理。
- **commands.ts**: `executeSlashCommand` 返回布尔值指示命令是否被找到并执行，供调用方做 fallback 决策。
- **websocket-protocol spec**: 修改 slash command 相关场景，不再对未知命令发 error 事件。

## Capabilities

### Modified Capabilities
- `web-frontend`: 修改 Input area 中 slash command 提交行为——slash 补全菜单保持显示，但提交时不再区分 slash/chat，统一走 chat 通道
- `websocket-protocol`: 修改 Slash command support via WebSocket 场景——未知命令不再发送 error，改为静默 fallback 为 chat 消息

## Impact

- `web/src/components/MessageInput.tsx` — `handleSubmit` 移除 `/` 前缀路由
- `src/ui/web/web-backend.ts` — `handleMessage` chat 分支改用命令匹配、`handleSlashCommand` 增加 fallback
- `src/ui/commands.ts` — `executeSlashCommand` 返回值改为 boolean
- 无 API 变更，无 breaking changes
