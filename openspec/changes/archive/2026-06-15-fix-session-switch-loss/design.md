## Context

当前 Web UI 的 session 切换流程存在严重缺陷——加载历史 session 时不检查也不中断当前 running turn。`WebUiBackend.handleMessage` → `handleSession` → `load` 仅做三件事：匹配 session ID、调用 `sessionManager.loadSession(id, agent)` 覆盖 agent 状态、发送 `clear_conversation` + `ready` 给前端。

关键缺失：
- 没有 `harness.abort()` → agent 继续跑旧 turn，但 `agent.state.messages` 已被覆盖
- 没有 `sessionManager.saveSession()` → 当前 session 丢失，sidebar 不更新
- 没有 `pushSessionList()` → 用户看不到当前 session 已保存到列表
- 前端 `processing` 状态在 `clear_conversation` 后仍然为 `true`，但消息内容已替换为另一个 session
- 空 session 堆积：每次 `/reset` 或 "New Session" 都会 `createSession()` 生成新 ULID，即使上一次 session 的 `messageCount === 0`。`persistEmptySession` 每次写入一个新文件而不清理旧文件

约束：
- 单 WebSocket 连接，单 agent 实例
- `agent.state.messages` 是全局可变状态，无 per-session 隔离
- `WebUiBackend` 方法通过 `broadcast` 推送到所有客户端，但同一时刻只有一个前端连接

## Goals / Non-Goals

**Goals:**
2. 当前 session 保存在列表里，用户在 sidebar 可见
3. Session 列表中 running session 有转圈指示器
4. `/session load` slash command 行为与 sidebar load 一致
5. 前端处理事件的 `currentSessionId` 逻辑正确
6. 禁止 0 消息的空 session 存在于列表和磁盘上——新建时复用，列表过滤，磁盘去重
2. 当前 session 保存在列表里，用户在 sidebar 可见
3. Session 列表中 running session 有转圈指示器
4. `/session load` slash command 行为与 sidebar load 一致
5. 前端处理事件的 `currentSessionId` 逻辑正确

**Non-Goals:**
- 不引入 per-session agent 实例或多并发 turn
- 不改变 TUI 的行为（TUI 无此问题——没有 session 侧边栏；但 0-msg 复用逻辑适用于所有 UI 模式）
- 不改变 TUI 的行为（TUI 无此问题——没有 session 侧边栏）

## Decisions

### Decision 1: Server-side: load path → abort → save → load

在 `web-backend.ts` `handleSession` load 分支中：

```
1. 检查 agent 是否在 processing（通过 harness.isProcessing 或标志位）
2. 如果 processing → harness.abort()
3. harness.saveSessionNow() — 保存当前 session
4. sessionManager.loadSession(id, agent) — 加载目标 session
5. clear_conversation → ready → pushSessionList
```

**Rationale**: 这保证了数据完整性——先保存当前 session 再切换。abort 确保不会出现"旧 turn 输出追到新 session"的问题。

**Alternatives considered**:
- 方案 A: 不 abort，仅标记等待完成 → 用户体验差，可能需要等很久
- 方案 B: 在 `sessionManager.loadSession` 内做 abort → 违反单一职责，session manager 不应知道 running state

### Decision 2: Protocol: `sessions` 事件增加 `isProcessing`

```typescript
// ServerEvent: sessions
{ type: "sessions"; data: SessionInfo[]; currentSessionId?: string; isProcessing?: boolean }
```

`isProcessing` 由 server 在 `pushSessionList` 时根据当前 agent 是否 running 设置。

`currentSessionId` 在每次 `pushSessionList` 时发送当前 `sessionManager.current.id`。

**Rationale**: 前端需要知道两件事——(a) 当前 active session 是哪个（高亮），(b) 是否正在 running（转圈）。现有 `currentSessionId` 在 connect 时发送但在 load 后不更新。

**Alternatives considered**:
- 方案 A: 单独事件类型 `session_processing` → 增加协议复杂度，且 `sessions` 本身就是 session 列表的完整快照
- 方案 B: 让前端自己跟踪 processing → 前端不知道 server 端状态，connect/reconnect 后丢失

### Decision 3: Frontend: running 指示器实现

Sidebar 的 `SessionsPanel` 中，每个 session item 判断：
- `session.id === currentSessionId && isProcessing` → 渲染 `<Spinner>` 图标（Phosphor Icons）带 CSS `@keyframes spin` 动画
- 同时 `currentSessionId` 条件的视觉高亮保留（`--color-accent-bg` 背景）

转圈指示器使用 `opacity: 0.6` 的低调样式，颜色跟随 `--color-accent`，不使用 pulses/glow 等重效果。

**Rationale**: 最小化视觉侵入，不引入新的动画库。Phosphor Icons 的 Spinner 已存在且项目规范要求单一图标族。

### Decision 4: Frontend: `clear_conversation` 后 `processing` 状态

当前 bug：前端在收到 `clear_conversation` 后 `processing` 仍为 `true`。修复后因为 server 先 abort 再 clear，顺序变为：

```
abort → agent_end → loader(state:hide) → processing=false
save → (无 UI 事件)
load → clear_conversation → ready → processing=false (已是 false)
```

但前端 `handleEvent` 处理 `clear_conversation` 时应显式设置 `processing = false`（防御性）。`ready` 事件不应改变 `processing` 状态。

**Rationale**: 即使 server 端保证顺序，前端做防御性 reset 防止未来引入异步竞态。

### Decision 5: `/session load` slash command 对齐

`handleSlashCommand` 中 `/session load <id>` 走相同逻辑：先检查并 abort → save → load。提取公共方法 `doLoadSession(client, sessionId)` 供 sidebar 和 slash command 共用。


### Decision 6: 空 session 复用与去重

**问题**: 每次 `/reset` 或点击 "New Session" 时，`createSession()` 无条件生成新 ULID，`persistEmptySession()` 写入新文件。结果：

```
用户操作: 打开 App → 点击 New Session → 点击 New Session → 点击 New Session
磁盘结果: session_AAA.json (0 msg), session_BBB.json (0 msg), session_CCC.json (0 msg), session_DDD.json (0 msg)
sidebar: 显示 4 个 "New session" 条目（0 msgs）
```

**方案**: 三层防护

1. **`createSession` 复用已有空 session**: 在生成新 ID 前，扫描 `listSessions()` 查找当前 project path 下 `messageCount === 0` 的 session。如果找到，直接复用其 metadata（id、createdAt、projectPath），只更新 updatedAt、model 等字段。

2. **`persistEmptySession` 去重**: 写入前先检查并删除当前 project 下其他 `messageCount === 0` 的 session 文件（排除当前 session 自身），保证磁盘上最多一个空 session。

3. **`listSessions` 过滤**: 返回列表时过滤掉 `messageCount === 0` 的 session，使 sidebar 不显示空 session。但要注意：如果当前 session 恰好是 0-msg（刚创建还未发消息），它在 `currentSessionId` 的视角下仍应是 active 的——因此在 server 端 pushSessionList 中保留该 session，在 sidebar 中通过 `currentSessionId` 匹配渲染但不显示消息数。

**实际用户体验**:
- 打开 App → sidebar 显示 1 个空 session（标记为 active，无消息数 badge）
- 点击 "New Session" → 复用同一个 session（不产生新条目）
- 再点击 "New Session" → 仍然复用
- 发送第一条消息 → session 被保存并获得标题，sidebar 显示正常条目

**Rationale**: 三层防护避免依赖单一入口。即使未来有新的 session 创建路径绕过 `/reset`（例如 session auto-create on connect），`persistEmptySession` 和 `listSessions` 也能兜底。

**Alternatives considered**:
- 方案 A: 仅在 `/reset` 中判断 → 不覆盖其他创建路径，且在 sidebar 和 slash command 中需要各自判断，容易遗漏
- 方案 B: 在 `listSessions` 中过滤但不动磁盘 → 磁盘仍累积垃圾文件
- 方案 C: 仅在 `persistEmptySession` 中覆盖 → 不解决 createSession 每次都生成新 ID 的问题
**Rationale**: 避免两处代码发散，slash command 此前可能遗漏 save+abort。

## Risks / Trade-offs

- **[abort 是强制的]**: 用户可能只是"瞟一眼"历史 session 想回来继续看当前输出 → Mitigation: save 保证了当前 session 可恢复；abort 后用户要重新 prompt
- **[save 可能失败]**: agent state 可能处于异常状态 → Mitigation: `saveSession` 内部有 try-catch，失败时发 error toast 但不阻止 load 继续
- **[Session 列表抖动]**: save 后 pushSessionList 可能导致当前 session 突然出现在列表顶部 → Mitigation: scroll preservation 已在 session-list-scroll-preservation spec 中处理
