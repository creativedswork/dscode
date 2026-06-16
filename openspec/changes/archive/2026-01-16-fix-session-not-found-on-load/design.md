## Context

当前架构中，`SessionManager.listSessions()` 按设计过滤 `messageCount === 0` 的 session。`WebUiBackend.pushSessionList()` 在发送 session 列表给客户端时，会通过 `getCurrentMetadata()` 将当前活跃 session 补回列表，即使它的 messageCount 为 0。但 `handleSession` 的 `"load"` 分支直接使用 `listSessions()` 查询目标 session，没有相同的 fallback，导致用户无法点击加载一个刚创建的空 session。

此外，`SessionStore.rebuildIndex()` 在重建索引时跳过 `messages.length === 0` 的 session 文件，与 `updateIndex()` 行为不一致，会在索引损坏恢复时丢失合法存在的空 session。

## Goals / Non-Goals

**Goals:**
- 用户点击新建的空 session 时能正常切换（不会报 "Session not found"）
- `rebuildIndex` 与 `updateIndex` 行为一致，不丢弃合法存在的空 session

**Non-Goals:**
- 不改变 `listSessions()` 的过滤语义（0-msg session 仍不出现于常规列表中）
- 不改变 session 创建、持久化、删除的现有流程
- 不改变前端侧任何行为

## Decisions

### Decision 1: 在 `handleSession` load 分支添加 fallback，而非修改 `listSessions()`

**选择**: 在 `WebUiBackend.handleSession` 的 `"load"` case 中，当 `listSessions()` 找不到匹配项时，fallback 检查 `getCurrentMetadata()`。

**理由**:
- `listSessions()` 过滤 0-msg 是 spec 明确定义的行为，广泛用于侧边栏列表渲染等场景，不应改动
- 与 `pushSessionList` 已有的补救逻辑保持一致，模式统一
- 改动最小，仅影响一个 handler 分支

**备选方案**: 修改 `listSessions()` 不过滤 0-msg，改为在 UI 层过滤 → 影响面大，需要追踪所有 `listSessions()` 调用点并确认每个调用点的预期行为。

### Decision 2: 移除 `rebuildIndex` 中的 empty-messages 跳过逻辑

**选择**: `rebuildIndex` 不应跳过 `messages.length === 0` 的 session 文件，仅跳过解析失败的损坏文件。

**理由**:
- `updateIndex`（通过 `save()` → `updateIndex()`）会正常写入 0-msg session，它们在磁盘上合法存在
- 如果 index.json 损坏触发 `rebuildIndex`，不应丢失这些 session
- 过滤逻辑应由 `SessionManager.listSessions()` 在应用层处理，而非索引层

## Risks / Trade-offs

- **[低风险] 索引包含更多条目**: 0-msg session 出现在索引中，但 `listSessions()` 仍会过滤它们，实际影响仅体现在 `rebuildIndex` 的场景中，该场景本身很少触发
- **[无风险] Fallback 逻辑**: 仅当 `listSessions()` 匹配数为 0 时触发，且仅匹配当前活跃 session。若同时满足 "当前 session 不在列表中" 和 "请求 id 不匹配当前 session"，则仍返回 "not found"，行为正确
