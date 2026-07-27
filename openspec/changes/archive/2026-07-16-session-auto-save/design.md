## Context

当前 session 持久化流程：

```
agent.prompt(text)
  │
  ▼
runAgentLoop():
  emit("agent_start")                    ← agent.state.messages 尚无 user msg
  emit("turn_start")
  for each prompt:
    emit("message_start")
    emit("message_end")                  ← user msg 被 push 到 state.messages ✨
  runLoop():
    streamAssistantResponse()            ← LLM 流式调用 (可能持续数分钟)
    ...
    emit("turn_end")                     ← 现有保存点 ①
  emit("agent_end")                      ← 现有保存点 ②
```

现有 crash 保护（`src/core/main.ts`）：

```
uncaughtException → emergencySaveSession() → process.exit
unhandledRejection → emergencySaveSession()
SIGINT → emergencySaveSession()
SIGTERM → emergencySaveSession() → process.exit
```

**漏洞**：从 `agent.prompt()` 调用到 `turn_end` 之间，user message 和流式响应都在内存中，如果进程被 `kill -9` 或事件循环阻塞，全部丢失。

## Goals / Non-Goals

**Goals:**
- User message 提交后立即持久化（pre-turn save）
- 长时间 agent 运行期间周期性保存中间状态（15s interval）
- 不增加明显的性能开销
- 不影响现有 crash handler 逻辑
- 现有的原子写入（tmp → rename）保持不变

**Non-Goals:**
- 实时流式逐 token 保存（过度，15s interval 足够）
- Session 文件压缩（不在 scope 内）
- 改变 session 序列化格式

## Decisions

### D1: Pre-turn save 挂钩 `message_end` 事件（role === "user"）

**决定**: 在 `agent.subscribe()` 中监听 `message_end` 事件，当 `event.message.role === "user"` 时调用 `trySaveSession`。

**理由**:
- `message_end` 是 pi-agent-core 将 user message 推入 `agent.state.messages` 的精确时机
- 此时 `agent.state.messages` 已包含 user message，但 LLM 调用尚未开始
- `agent_start` / `turn_start` 事件触发时 user message 尚未在 state 中，不可用

**备选**: 
- 在 `promptAndSave()` 中手动 push user message 然后 save → 侵入 agent 内部状态，破坏 pi-agent-core 抽象
- 在 `agent_start` 中 save → 此时 messages 尚未推入 state，保存的是旧状态

### D2: 15s 周期自动保存，基于消息数量 dirty check

**决定**: 在 `Harness` 中使用 `setInterval(15000)` 周期检查 `agent.state.messages.length` 是否变化，变化则 `trySaveSession`。timer 通过 `.unref()` 防止阻止进程退出。

**理由**:
- 消息数量是最轻量的 dirty signal，O(1) 检查
- 15s 间隔在覆盖率和 I/O 开销之间取得平衡
- `.unref()` 确保 timer 不会阻止正常退出流程

**备选**:
- 内容 hash 对比 → O(n) 每次检查，对大型会话开销大
- 5s 间隔 → I/O 频率过高，session JSON 写盘可能成为瓶颈
- 30s 间隔 → 覆盖窗口过大

### D3: dirty counter 共享所有保存路径

**决定**: 所有保存点（`message_end`、`agent_end`、`turn_end`、auto-save timer、shutdown）共享同一个 `lastSavedMessageCount`，任意保存后更新。

**理由**:
- 避免 auto-save timer 在已有保存后重复写入
- 单一 dirty tracking 变量，简单可靠

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 流式输出过程中保存的部分 assistant message 可能不完整 | pi-ai 的 `message_update` 事件中消息结构完整，且 pi-ai 在流式输出期间不将 assistant message 推入 `agent.state.messages`（仅在 `message_end` 时 push），因此周期性保存不会捕获到残缺消息 |
| 15s 间隔内在高速 tool-calling 场景下可能丢失部分中间轮次 | 这是 trade-off — 更短间隔会增加 I/O。15s 是合理折中 |
| `message_end` 事件也会在 tool result 注入时触发 | 通过 `role === "user"` 过滤，tool result 的 role 不同，不会被误触 |

## Migration Plan

1. 在 `Harness` 中新增 `lastSavedMessageCount` 字段和 `autoSaveTimer`
2. 在 `agent.subscribe()` 中新增 `message_end` case
3. 在 `run()` 中启动 timer，在 `shutdown()` 中清除
4. 无数据迁移需求
5. 无向后兼容问题

## Open Questions

- 无
