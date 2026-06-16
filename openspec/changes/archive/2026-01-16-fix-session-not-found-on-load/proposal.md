## Why

新建 session 后（messageCount=0），点击左侧 session 列表切换回该 session 时，服务端 `handleSession` 的 `load` 分支直接使用 `listSessions()` 查询 session，而该方法按设计过滤掉 `messageCount===0` 的 session。`pushSessionList` 已有将当前 session 补回列表的补救逻辑，但 `load` 分支缺少相同处理，导致返回 "Session not found" 错误。

## What Changes

- 在 `WebUiBackend.handleSession` 的 `"load"` 分支中，当 `listSessions()` 找不到匹配 session 时，增加 fallback：检查请求的 id 是否匹配当前活跃 session（`getCurrentMetadata()`），若匹配则直接使用当前 session 的 metadata 继续加载流程。
- 在 `SessionStore.rebuildIndex` 中，移除对 `messages.length === 0` 的过滤，保持索引与实际磁盘文件一致（0-msg session 既然被 persistEmptySession 写入磁盘，就应在索引中可见）。

## Capabilities

### New Capabilities
<!-- No new capabilities — this is a bug fix on existing behavior. -->

### Modified Capabilities
- `session-management`: `handleSession` load 分支的行为现在与 `pushSessionList` 一致——当 `listSessions()` 因 messageCount=0 过滤掉当前 session 时，fallback 到当前 session metadata。`rebuildIndex` 不再跳过 messages 为空的 session 文件，保持索引完整性。

## Impact

- `src/ui/web/web-backend.ts` — `handleSession` "load" case，增加 fallback 逻辑
- `src/session/store.ts` — `rebuildIndex`，移除 empty-messages 跳过逻辑
- `src/session/manager.ts` — `listSessions()` 行为不变（spec 已明确其过滤语义）
