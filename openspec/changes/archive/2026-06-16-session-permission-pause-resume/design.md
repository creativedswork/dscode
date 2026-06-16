## Context

当前 Plan A 在用户切换 session 时 abort + save + deny 权限。但被中断的 session 对话历史中留下了一条未完成的 partial assistant message——agent 发出了 tool permission 请求但从未收到响应。用户切回该 session 时看到的是一个"空气泡"（不完整的 tool 请求），不知道发生了什么。

需要实现"跨 session 权限暂停/恢复"：将未完成的 tool permission 信息存入 session 元数据，切换时回滚对话中的 partial message，切回时自动恢复弹窗并让用户继续。

约束：
- 单 agent 实例，`agent.state.messages` 是全局可变状态
- `SessionMetadata` 目前只存储标题、时间、消息数等摘要信息
- 前端 PermissionDialog 目前由 `permission_prompt` WebSocket event 触发，是瞬时事件

## Goals / Non-Goals

**Goals:**
- 切换 session 时保存 pending permission 状态到 session 元数据
- 保存前回滚最后一条 partial assistant message（tool 请求未被响应的那条），保证对话历史干净
- 加载 session 时，若存在 `pendingPermission`，前端自动弹出 PermissionDialog
- 用户 Allow 后，后端重新触发 agent 执行并自动允许该 tool permission
- 用户 Deny 后，清除 pendingPermission，对话保持干净

**Non-Goals:**
- 不支持多个 session 同时有待处理权限（单 agent 限制）
- 不改变 TUI 的行为（TUI 无 session 切换概念）
- 不持久化 PermissionDialog 的 UI 状态（仅存数据）

## Decisions

### Decision 1: 在 `handleSession` load 时，回滚 partial message 后保存

**Choice**: `saveSession` 在保存前检查 `permissionResolve`。若存在，回滚 agent 消息列表中的最后一条 assistant message（角色为 assistant 且带有 pending tool request），然后添加 `pendingPermission` 到 metadata。abort 在回滚前执行以停止 agent。

**Rationale**: 回滚保证对话历史中没有"空气泡"。`pendingPermission` 存有足够信息让前端在下一次加载时重建 PermissionDialog。

**Alternatives considered**:
- 不回滚，仅在 UI 层隐藏 → 对话数据不一致，加载时消息列表仍有 incomplete message
- 新增 `pendingPermissionMessages` 字段存完整消息 → 过于复杂，回滚更简单

### Decision 2: `pushSessionList` 携带 `pendingPermission`

**Choice**: `pushSessionList` 在构建 `SessionInfo` 时从 `sessionManager.getCurrentMetadata()` 读取 `pendingPermission` 字段，传递给前端。前端在收到 `sessions` event 且 `currentSessionId` 对应的 session 有 `pendingPermission` 时自动弹出 PermissionDialog。

**Rationale**: 复用现有的 `pushSessionList` → `sessions` event 通道，不需要新的事件类型。前端在 session 列表更新时自然获得权限状态。

**Alternatives considered**:
- 新增独立的 `pending_permission` event → 增加协议复杂度，且时序需要额外管理
- 在 `ready` event 中携带 → `ready` 只在 connect/load 时发送，sessions 更新更频繁

### Decision 3: Allow 后重新触发 agent

**Choice**: 用户 Allow 后，后端调用 `harness.promptAndSave(text)` 从最后一条 user message 重新开始。同时通过 pre-approve 机制自动允许该 tool permission（使用已有的 `permissionManager` session grant 或临时白名单）。

**Rationale**: 重新触发比"恢复中断点"更可靠——agent 状态完全重建，不依赖被 abort 后的内部状态。Pre-approve 避免再次弹窗。

**Alternatives considered**:
- 从 tool 调用点恢复 → agent 已被 abort，内部状态不可靠
- 手动告诉用户"请重新发送消息" → UX 差

### Decision 4: Session 元数据扩展字段设计

**Choice**: `SessionMetadata` 新增可选字段：
```typescript
pendingPermission?: {
  toolName: string;
  preview: string;
  fuzzyPattern?: string;
  permissionArgs?: unknown;
}
```

**Rationale**: 最小化存储——只存恢复弹窗所需的信息。不需要存完整的 tool call 消息或 agent 状态。

## Risks / Trade-offs

- **Risk**: 回滚可能误删正确的 assistant message → **Mitigation**: 仅回滚最后一条 role===assistant 且带有 tool 请求的消息（检查 `content` 中是否有 `type==="tool_use"` block），而不是删除所有 assistant 消息
- **Risk**: 重新触发 agent 时 tool 行为可能不同（side effects）→ **Mitigation**: 大多数 tool 是幂等的（读文件、搜索等）；写操作有 `file-write-tracker` 保护。如果 tool 有 side effect，first run 的结果已被丢弃（abort 前），用户接受重新执行
- **Risk**: `agent.state.messages` 在 abort 后可能处于不一致状态 → **Mitigation**: `saveSession` 在回滚后保存的是干净的消息列表，`loadSession` 会完全替换消息状态
