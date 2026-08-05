## Purpose

Session persistence layer: store, load, list, and delete conversation sessions with versioned JSON files. Supports image caching via ImageRef and vision message tracking.
## Requirements
### Requirement: Session Version Upgrade to V2

The `SerializedSession` SHALL support version 2 with image references.

#### Scenario: V2 session save
- **WHEN** a session contains messages with images
- **THEN** the saved session file SHALL have `version: 2`
- **AND** messages SHALL use `ImageRef` instead of inline base64 for image content
- **AND` metadata SHALL include `hasImages: boolean` and `imageCount: number`

#### Scenario: V2 session load
- **WHEN** a session file with `version: 2` is loaded
- **THEN** the system SHALL parse its messages including `ImageRef` and `visionMessages`
- **AND** attempt to recover image data from cache

### Requirement: Session Version Upgrade to V3

The `SerializedSession` SHALL support version 3 with generic child Agent records.

#### Scenario: SubAgent session association
- **WHEN** a child Agent exits
- **THEN** the parent session SHALL store an `agentMessages` entry with `role: "subagent"`
- **AND** the entry SHALL include the child process ID, Application, state, input, output, and timestamps
- **AND** the child transcript SHALL remain in AgentProcessStore rather than the Main Agent `messages`

#### Scenario: V2 vision record migration
- **WHEN** a version 2 session containing `visionMessages` is loaded
- **THEN** the records SHALL be converted to in-memory `agentMessages`
- **AND** the next save SHALL persist the session as version 3 without `visionMessages`

### Requirement: V1 Backward Compatibility

The session store SHALL load version 1 session files without error.

#### Scenario: Load V1 session
- **WHEN** a session file has `version: 1`
- **THEN** the system SHALL load it successfully
- **AND** set `hasImages: false` on the metadata
- **AND** not attempt to parse `visionMessages` or `ImageRef` fields

### Requirement: SessionStore loadSessionFile Public Method

The `SessionStore` class SHALL expose a public method `loadSessionFile(sessionId: string): Promise<SerializedSession | null>` that reads a session JSON file from disk and returns the raw serialized data. Returns `null` on any error (missing file, invalid JSON, validation failure). The returned data SHALL include all message fields required for CHIFF causal graph analysis: thinking blocks, toolCall blocks (name, arguments), toolResult content blocks, usage statistics, stopReason, and responseId.

#### Scenario: Load existing session file

- **WHEN** `loadSessionFile("00MPX37L8RW7I64DNM725JX5MK")` is called and the session JSON file exists on disk
- **THEN** the method SHALL return the parsed `SerializedSession` object
- **AND** the object SHALL contain all raw message data including thinking, toolCall, toolResult, usage, and stopReason fields

#### Scenario: Session file not found

- **WHEN** `loadSessionFile("nonexistent")` is called and no session file exists for that ID
- **THEN** the method SHALL return `null`
- **AND** NOT throw an error

#### Scenario: Corrupted session file

- **WHEN** `loadSessionFile(id)` is called and the session file contains invalid JSON
- **THEN** the method SHALL return `null`
- **AND** NOT crash the process

### Requirement: SessionStore projectDirPath Public Method

The `SessionStore` class SHALL expose a public method `projectDirPath(): string` that returns the project-specific session directory path, complementing the existing `globalDirPath()` method.

#### Scenario: projectDirPath returns correct directory

- **WHEN** `projectDirPath()` is called
- **THEN** it SHALL return the project-scoped session directory (e.g., `~/.dscode/data/sessions/by-project/<slug>`)

### Requirement: SessionManager getSessionFilePath Method

The `SessionManager` class SHALL expose a method `getSessionFilePath(idOrPrefix: string)` that locates a session file by full ID or prefix match (minimum 8 characters). It SHALL return `{ path: string; metadata: SessionMetadata }` on success, or `null` if no unique match. Uses `projectDirPath()` and `globalDirPath()` to scan both project and global session directories.

#### Scenario: Match by full session ID

- **WHEN** `getSessionFilePath("00MPX37L8RW7I64DNM725JX5MK")` is called with a full valid ID
- **THEN** the method SHALL return the file path and metadata for that session

#### Scenario: Match by 8-character prefix

- **WHEN** `getSessionFilePath("00MPX37L8")` is called with an 8-character prefix matching exactly one session
- **THEN** the method SHALL return the file path and metadata for the matching session

#### Scenario: Ambiguous prefix match

- **WHEN** `getSessionFilePath("00MPX37L")` is called with a prefix shorter than 8 characters matching multiple sessions
- **THEN** the method SHALL return `null`

#### Scenario: No match

- **WHEN** `getSessionFilePath("ZZZZZZZZ")` is called and no session ID starts with that prefix
- **THEN** the method SHALL return `null`

### Requirement: SessionManager loadSessionFile Method

The `SessionManager` class SHALL expose a public method `loadSessionFile(sessionId: string): Promise<SerializedSession | null>` that delegates to `SessionStore.loadSessionFile()`. This provides a clean public API for loading raw session data without accessing internal store fields.

#### Scenario: Load via SessionManager

- **WHEN** `manager.loadSessionFile(id)` is called
- **THEN** it SHALL delegate to `this.store.loadSessionFile(id)`
- **AND** return the result without modification

### Requirement: Session load saves current session first
The `handleSession` → `load` handler in `WebUiBackend` SHALL, before loading the requested session: (1) abort the current agent turn if one is running, (2) save the current session to disk via `harness.saveSessionNow()`, and (3) send an updated session list via `pushSessionList` so the sidebar reflects the saved session. Only after these steps SHALL it call `sessionManager.loadSession()` to replace agent state and send `clear_conversation` + `ready` to the client.

Additionally, if a tool permission prompt was active (`permissionResolve` is non-null), the save step SHALL: roll back the last partial assistant message from the agent's messages before persisting, and store `pendingPermission` information (`{ toolName, preview, fuzzyPattern, permissionArgs }`) in the session metadata.

#### Scenario: Load aborts running turn
- **WHEN** the client sends `{ type: "session", action: "load", id: "B" }` and the agent is currently processing a turn
- **THEN** the server calls `harness.abort()` to stop the running turn before loading session B

#### Scenario: Load saves current session
- **WHEN** the client sends a session load command
- **THEN** the server calls `harness.saveSessionNow()` to persist the current session to disk before overwriting agent state

#### Scenario: Load sends updated session list
- **WHEN** the server has saved the current session after a load command
- **THEN** it calls `pushSessionList(client)` so the frontend sidebar displays all sessions including the just-saved one

#### Scenario: Load proceeds after abort and save

#### Scenario: Load saves current session with pending permission
- **WHEN** a session load is requested while a tool permission prompt is active for tool "bash"
- **THEN** the WebUiBackend SHALL save the current session with `pendingPermission: { toolName: "bash", preview: "...", fuzzyPattern: "mcp__*", permissionArgs: {...} }` in its metadata
- **AND** the last partial assistant message (role===assistant with a tool_use content block requesting "bash") SHALL be removed from the saved messages

#### Scenario: Load saves current session without pending permission
- **WHEN** a session load is requested and no tool permission prompt is active
- **THEN** the WebUiBackend SHALL save the current session normally without `pendingPermission` in metadata
- **AND** no messages are rolled back
- **WHEN** abort and save have both completed
- **THEN** the server calls `sessionManager.loadSession(id, agent)`, then sends `clear_conversation` and `ready` with the loaded session's conversation history

### Requirement: Zero-message session reuse on create
When `SessionManager.createSession()` is called, it SHALL scan existing sessions in the current project scope. If any session has `messageCount === 0`, it SHALL reuse that session's `id` and `createdAt` fields (updating only `updatedAt`, `modelProvider`, and `modelId`) instead of generating a new ULID.

#### Scenario: Reuse existing empty session
- **WHEN** `createSession()` is called and a session with `messageCount === 0` exists in the current project
- **THEN** the returned `SessionMetadata` reuses the existing session's `id` and `createdAt`, with `updatedAt` set to now, `modelProvider` and `modelId` from arguments

#### Scenario: Create new session when none are empty
- **WHEN** `createSession()` is called and no session with `messageCount === 0` exists in the current project
- **THEN** a new ULID is generated and returned as a fresh `SessionMetadata`

### Requirement: persistEmptySession deduplicates
When `SessionManager.persistEmptySession()` is called, it SHALL, before writing the current empty session, delete any other session file in the same project directory whose metadata has `messageCount === 0` (excluding the current session itself).

#### Scenario: Clean up prior empty sessions
- **WHEN** `persistEmptySession()` is called and another session file with `messageCount === 0` exists on disk in the current project directory
- **THEN** that other session file is deleted before the current empty session is written

#### Scenario: No duplicate delete of self
- **WHEN** `persistEmptySession()` is called and the only session with `messageCount === 0` is the current session
- **THEN** the current session file is written without deleting itself

### Requirement: listSessions filters zero-message entries
`SessionManager.listSessions()` SHALL exclude sessions where `messageCount === 0` from the returned array.

#### Scenario: Empty sessions excluded from list
- **WHEN** `listSessions()` is called and the current project contains sessions with `messageCount` values of 0, 3, and 5
- **THEN** the returned array contains only the sessions with `messageCount` 3 and 5

#### Scenario: Current session preserved in list when empty
- **WHEN** the current active session has `messageCount === 0`
- **THEN** that session is still excluded from `listSessions()` output; the `pushSessionList` server method adds it back when sending to the client, using `currentSessionId` to identify it; the `handleSession` `"load"` handler also falls back to `getCurrentMetadata()` when `listSessions()` returns no matches

### Requirement: handleSession load fallback to current session

The `WebUiBackend.handleSession` `"load"` handler SHALL, when `listSessions()` returns zero matches for the requested session ID, check whether the request ID matches the current active session via `sessionManager.getCurrentMetadata()`. If the current session metadata exists and its `id` starts with the requested ID prefix, the handler SHALL proceed with loading the current session instead of returning a "Session not found" error.

This ensures consistency with `pushSessionList()`, which already includes the current session in the client-facing list even when its `messageCount` is 0.

#### Scenario: Load current empty session via sidebar click

- **WHEN** the client sends `{ type: "session", action: "load", id: "<currentSessionId>" }` and the current session has `messageCount === 0` (thus excluded from `listSessions()` output)
- **THEN** the handler finds no match in `listSessions()` but detects that `getCurrentMetadata()?.id` starts with the requested ID
- **AND** proceeds with the normal load flow (abort → save → loadSession → clear_conversation → ready)
- **AND** does NOT return "Session not found" error

#### Scenario: Load non-existent session still returns error

- **WHEN** the client sends `{ type: "session", action: "load", id: "NONEXIST" }` and no session with that ID exists (neither in `listSessions()` nor as current session)
- **THEN** the handler returns `{ type: "error", text: "Session not found: NONEXIST" }`

#### Scenario: Ambiguous prefix match still returns error

- **WHEN** the client sends `{ type: "session", action: "load", id: "00" }` and `listSessions()` matches more than one session with that prefix
- **THEN** the handler returns `{ type: "error", text: "Ambiguous session ID prefix. ..." }` without checking the current session fallback

### Requirement: rebuildIndex preserves empty-message sessions

`SessionStore.rebuildIndex()` SHALL include session files with `messages.length === 0` in the rebuilt index, as long as the file contains valid `metadata` with a valid `id` field. Only files that fail to parse as valid JSON or lack valid `metadata.id` SHALL be skipped.

The existing fix-up for `messageCount === 0 && messages.length > 0` SHALL remain unchanged.

#### Scenario: Empty session preserved in rebuilt index

- **WHEN** `rebuildIndex()` scans a directory containing a valid session file with `messages: []` and valid metadata
- **THEN** that session SHALL appear in the rebuilt index with its original metadata

#### Scenario: Corrupted session file still skipped

- **WHEN** `rebuildIndex()` scans a directory containing a file with invalid JSON or missing `metadata.id`
- **THEN** that file SHALL be silently skipped

### Requirement: SessionManager clears current on delete
`SessionManager.deleteSession()` SHALL clear `this.current` (set to `null`) when the deleted session ID matches the currently active session ID. This ensures `getCurrentSessionId()` returns `null` after the active session is deleted.

#### Scenario: Delete active session clears current
- **WHEN** `deleteSession("ABC")` is called and `this.current?.id === "ABC"`
- **THEN** `this.current` is set to `null` before the `session:deleted` event is emitted
- **AND** `getCurrentSessionId()` returns `null`

#### Scenario: Delete non-active session preserves current
- **WHEN** `deleteSession("XYZ")` is called and `this.current?.id === "ABC"` (different from "XYZ")
- **THEN** `this.current` remains unchanged (still points to session "ABC")
- **AND** `getCurrentSessionId()` returns `"ABC"`

#### Scenario: Delete when no current session is set
- **WHEN** `deleteSession("ABC")` is called and `this.current` is `null`
- **THEN** no error is thrown
- **AND** `getCurrentSessionId()` returns `null`

### Requirement: WebUiBackend sends clear_conversation on current session delete
The `WebUiBackend.handleSession` delete handler SHALL, before calling `deleteSession()`, capture whether the deleted session is the currently active session. If it is, the handler SHALL send a `clear_conversation` event (in addition to the updated session list) so the frontend resets its message state. The handler SHALL also include `currentSessionId` in the `sessions` response.

#### Scenario: Delete current session sends clear_conversation
- **WHEN** the client sends `{ type: "session", action: "delete", id: "<currentSessionId>" }`
- **THEN** the handler captures `wasCurrent = true` before calling `deleteSession()`
- **AND** after successful deletion, sends `{ type: "clear_conversation" }` to the requesting client
- **AND** sends `{ type: "sessions", currentSessionId: null, data: [...] }` with the updated list

#### Scenario: Delete non-current session does not send clear_conversation
- **WHEN** the client sends `{ type: "session", action: "delete", id: "<nonCurrentSessionId>" }`
- **THEN** the handler captures `wasCurrent = false` before calling `deleteSession()`
- **AND** after successful deletion, does NOT send `clear_conversation`
- **AND** sends `{ type: "sessions", currentSessionId: "<stillCurrentId>", data: [...] }` with the updated list

### Requirement: Session content hash computation
When `SessionManager.saveSession()` is called, the session manager SHALL compute a content hash from the serialized messages and store it in `SessionMetadata.contentHash`.

#### Scenario: contentHash computed on save
- **WHEN** `saveSession()` is called with an agent that has messages
- **THEN** the method SHALL compute a SHA-256 hash of the concatenated message role and first 200 characters of each message's content string
- **AND** store the first 12 hexadecimal characters of the hash in `this.current.contentHash`

#### Scenario: contentHash persisted to disk
- **WHEN** a session is saved to disk via `SessionStore.save()`
- **THEN** the serialized JSON SHALL include `contentHash` in the `metadata` object

#### Scenario: contentHash stable for identical content
- **WHEN** `saveSession()` is called twice on the same set of messages
- **THEN** the resulting `contentHash` SHALL be identical both times

#### Scenario: contentHash changes when content changes
- **WHEN** a new message is added to the conversation and `saveSession()` is called again
- **THEN** the resulting `contentHash` SHALL differ from the previous call's hash

### Requirement: contentHash exposed in SessionInfo
The `WebUiBackend.handleSession("list")` handler SHALL include the `contentHash` field when mapping `SessionMetadata` to `SessionInfo` for the frontend.

#### Scenario: contentHash in session list response
- **WHEN** the client sends `{ type: "session", action: "list" }`
- **THEN** each entry in the `sessions` event SHALL include a `contentHash` field from the session metadata

#### Scenario: contentHash included in SessionInfo type
- **WHEN** the `SessionInfo` TypeScript type is defined in `src/ui/shared/types.ts`
- **THEN** it SHALL include a `contentHash: string` field

### Requirement: Session title derived from first non-command user message

The `SessionManager` SHALL derive the session title from the first user message that does not start with a slash command. If all user messages start with slash commands, the system SHALL extract the argument from the first command message after stripping the `/command` prefix. The title SHALL be truncated to 60 characters. On subsequent saves, the title SHALL be re-evaluated and updated if a more substantive candidate is found from later user messages.

#### Scenario: First message is a slash command with argument

- **WHEN** `saveSession()` is called and the first user message is `/opsx:propose fix-session-title`
- **THEN** the session title SHALL be set to `fix-session-title`

#### Scenario: First message is a slash command without argument

- **WHEN** `saveSession()` is called and the first user message is `/help` and the second is "How do I fix this bug?"
- **THEN** the session title SHALL be set to the first 60 characters of "How do I fix this bug?"

#### Scenario: First message is plain text

- **WHEN** `saveSession()` is called and the first user message is "Debug session title extraction"
- **THEN** the session title SHALL be set to "Debug session title extraction" (unchanged from current behavior)

#### Scenario: Title updates on subsequent saves

- **WHEN** `saveSession()` is called and the title is currently a command remnant like "help", and a later user message is "Debug the title extraction logic"
- **THEN** the title SHALL be updated to the first 60 characters of "Debug the title extraction logic"

#### Scenario: Array content with command text block

- **WHEN** the first user message has `content: [{ type: "text", text: "/opsx:propose add-auth" }]`
- **THEN** the session title SHALL be set to `add-auth`

### Requirement: Pre-turn session save on user message

Session MUST be saved to disk immediately after the user's message is pushed to `agent.state.messages` and before the LLM call begins.

**Event**: `message_end` from pi-agent-core agent subscription, when `event.message.role === "user"`

#### Scenario: User submits a prompt

- **GIVEN** a session is active with N messages on disk
- **WHEN** `agent.prompt(text)` is called, user message is pushed to `agent.state.messages`, and `message_end` fires with `message.role === "user"`
- **THEN** `SessionManager.trySaveSession()` is called
- **AND** the session file on disk contains N+1 messages (including the new user message)
- **AND** subsequent LLM call proceeds normally

#### Scenario: Process killed after pre-turn save

- **GIVEN** pre-turn save completed successfully
- **WHEN** process is killed (SIGKILL, crash, freeze) during the subsequent LLM call
- **THEN** user message is preserved in the session file on disk
- **AND** session can be reloaded and resumed from the user message

#### Scenario: Non-user message_end does not trigger save

- **GIVEN** an agent loop is running
- **WHEN** `message_end` fires for a tool result or assistant message (role !== "user")
- **THEN** no session save is triggered

---

### Requirement: Periodic auto-save during agent execution

Session MUST be saved periodically (every 15 seconds) during agent execution when new messages have been added since the last save.

#### Scenario: Auto-save triggers during long streaming

- **GIVEN** a session with last saved message count M
- **AND** auto-save timer is running (15s interval)
- **WHEN** `agent.state.messages.length` exceeds M (new messages added since last save)
- **THEN** `SessionManager.trySaveSession()` is called
- **AND** `lastSavedMessageCount` is updated to current message count

#### Scenario: Auto-save skips when no new messages

- **GIVEN** a session with last saved message count M
- **AND** auto-save timer fires
- **WHEN** `agent.state.messages.length` equals M
- **THEN** no save is performed (no dirty data)

#### Scenario: Auto-save does not block process exit

- **GIVEN** auto-save timer is running
- **WHEN** the process exits normally (SIGINT, shutdown)
- **THEN** timer does not prevent exit (`.unref()` is called on the timer)
- **AND** timer is cleared during `shutdown()`

#### Scenario: All save paths share dirty counter

- **GIVEN** a session where pre-turn save just completed
- **AND** `lastSavedMessageCount` is now set to current message count
- **WHEN** auto-save timer fires 5 seconds later
- **THEN** `agent.state.messages.length` equals `lastSavedMessageCount`
- **AND** no redundant save is triggered

### Requirement: Session 预加载与提交分离

SessionManager SHALL 支持在不修改当前状态的情况下预加载目标 Session。预加载
MUST 完成 JSON 校验、metadata 校验、Main 消息读取、`agentMessages` 迁移和图片
资源恢复；提交操作 MUST 不执行文件 I/O。

#### Scenario: 预加载成功
- **WHEN** 系统预加载合法的目标 Session
- **THEN** 返回固定 prepared snapshot，当前 Session 和 Main Agent messages 保持不变

#### Scenario: 预加载失败
- **WHEN** 目标 Session 损坏或图片恢复过程发生不可恢复错误
- **THEN** 返回错误且不修改当前 Session、messages 或 agentMessages

### Requirement: 提交恢复 Main 与 Agent 记录

提交 prepared snapshot 时，SessionManager SHALL 将 snapshot 的 Main 消息赋给
Main PiAgentRuntime，并独立恢复 `agentMessages`。SubAgent transcript MUST NOT
追加到 Main Agent messages。

#### Scenario: 加载带 SubAgent 的 Session
- **WHEN** 目标 Session 包含 Main messages 和三个 agentMessages
- **THEN** Main PiAgentRuntime 只恢复 Main messages，SessionManager 恢复三个 agentMessages

#### Scenario: 加载旧 Vision Session
- **WHEN** 目标是包含 legacy visionMessages 的版本 2 Session
- **THEN** 预加载将其转换为内存 AgentSessionMessage，提交后仍不污染 Main messages

### Requirement: 原 Session 在提交前持久化

统一切换事务 SHALL 在目标 Session commit 前保存源 Session 的 Main messages、
metadata、`agentMessages` 和可选 PendingPermission。

#### Scenario: 源 Session 有未保存消息
- **WHEN** Session A 存在未保存 Main 消息并切换到 B
- **THEN** A 的磁盘记录在 B commit 前包含该消息

#### Scenario: 后台 Agent 已更新源 Session
- **WHEN** background Agent 在切换准备期间完成并写入 Session A
- **THEN** A 保存后的 agentMessages 保留该 Agent 记录

### Requirement: Session load 事件是完成通知

`session:loaded` SHALL 在 prepared snapshot commit 后发出，作为状态已经切换的通知。
关键 Process 重绑定 MUST NOT 依赖未等待的事件 handler。

#### Scenario: 观察加载事件
- **WHEN** 监听器收到目标 Session B 的 session:loaded
- **THEN** SessionManager.current、Main messages、agentMessages 和 Main Process parentSessionId 均已指向 B

