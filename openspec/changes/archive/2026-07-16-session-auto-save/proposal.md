## Why

当前 session 持久化依赖 turn 完成事件（`agent_end` / `turn_end`）或进程退出信号（SIGINT / SIGTERM / uncaughtException）。在 TUI 或 WebUI 卡死、网络 hang、agent 工具调用死循环等场景下，进程可能被 `kill -9` 强杀，导致整个卡死期间积累的对话内容全部丢失。

具体漏洞窗口：

```
User prompt → agent.prompt() → [agent loop — 可能持续数分钟]
                                   ↑
                              进程在此被强杀 → user message + 所有中间状态丢失
```

当前已有的 crash 保护（`emergencySaveSession` on SIGINT/SIGTERM/uncaughtException）只覆盖进程收到信号的场景，无法覆盖事件循环阻塞或 `kill -9` 的场景。

## What Changes

- **策略 1 — Pre-turn save**：在 pi-agent-core 的 `message_end` 事件中，当 user message 被推入 `agent.state.messages` 后立即保存 session。确保用户输入永不失。
- **策略 2 — 15s 周期自动保存**：在 `Harness` 中启动一个 `setInterval`，每 15 秒检查 `agent.state.messages` 是否有新内容，有则保存。覆盖长时间 streaming / agent loop 中间状态。

两者互补：策略 1 保底用户输入，策略 2 覆盖流式过程中的中间状态。

## Capabilities

### Modified Capabilities

- `session-management`: 新增 pre-turn save 点和 periodic auto-save 机制

## Impact

- **`src/core/harness.ts`**: 新增 `message_end` 事件处理（pre-turn save）；新增 auto-save timer 和 dirty tracking
- **`src/core/main.ts`**: 不受影响（现有 crash handlers 不变）
- **`src/session/manager.ts`**: 不受影响（仅被调用）
- **`src/session/store.ts`**: 不受影响（原子写入已有）
- **非 UI 变更**: 无需修改 TUI / WebUI

## Prototype

非 UI 变更，无需原型。
