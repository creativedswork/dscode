## Context

The TUI already uses `CombinedAutocompleteProvider` from `@earendil-works/pi-tui` with `basePath` set to the project directory. This provider already supports `@`-triggered fuzzy file path completion, scanning the filesystem for matching files. What's missing:

1. **Resolution on submit**: When the user submits a message containing `@path/to/file`, the file contents are NOT read and injected into the prompt. The raw `@path/to/file` text is sent as-is. The model never sees the actual file content.
2. **Web UI**: The web frontend has no `@` autocomplete at all. The browser cannot scan the filesystem, so it needs server assistance for file listings.

## Goals / Non-Goals

**Goals:**
- TUI: Resolve `@path` references in submitted messages, reading file contents and injecting them as structured context into the LLM prompt
- Web UI: Implement `@`-triggered file autocomplete dropdown with server-provided file listings, using the same resolution logic
- Shared resolution: One function `resolveAtFileRefs(projectPath, text, limits)` returning resolved text + any warnings
- Configurable limits: max files per message, max file size, max total content size
- Both UIs produce the same final prompt format for `@file` context

**Non-Goals:**
- `@` directory/bundle references (e.g., `@src/` to include an entire directory)
- `@` for symbols, functions, or LSP-powered references
- `@` for other content types (images are already handled, MCP tools are handled via `/`)
- Changing the `CombinedAutocompleteProvider` itself (already works for TUI)
- Binary file support (only text files)

## Decisions

### 1. Resolution format: replace `@path` with file content in the user message text

**Chosen**: Replace each `@relative/path` with a markdown code block containing the file content, prefixed by the file path.

```
@src/core/main.ts
```
becomes:
```
`/src/core/main.ts`:
```typescript
// actual file content
```
```

The markdown fenced code block is a well-understood format that LLMs parse naturally. Language tag is inferred from file extension.

**Alternative considered**: Sending files as separate `images`-like attachment field in the protocol. Rejected because it requires modifying the agent's core message structure (pi-agent-core types), adding complexity. Injecting directly into the text is simpler and works with any LLM.

### 2. Resolution location: shared module + per-UI call

- TUI: `handleSubmit` calls `resolveAtFileRefs` before passing text to `agent.prompt()`
- Web: The browser has no filesystem access, so resolution happens in `web-backend.ts` on the server when a `chat` command arrives. The web client does NOT resolve files — it only handles autocomplete display.

**Alternative considered**: Web client resolves files client-side via a server endpoint. Rejected because it adds latency (extra round-trip per file), and the server must validate anyway.

### 3. Web UI file listing: new WebSocket `file_list` request/response

When the user types `@` in the web input, the client sends:
```json
{ "type": "file_list", "prefix": "src/co" }
```
Server responds with:
```json
{ "type": "file_list_result", "prefix": "src/co", "items": [{"path": "src/core/main.ts", "isDir": false}, ...] }
```

**Alternative considered**: REST endpoint for file listing. Rejected because the WebSocket is already established and authenticated; adding a REST endpoint would require additional routing, CORS considerations, and auth logic.

### 4. Limits: configurable with reasonable defaults

Default limits (overridable via `.dscode/settings.json` or user settings):
- `atFileMaxFiles`: 5 files per message
- `atFileMaxFileSize`: 50 KB per file
- `atFileMaxTotalSize`: 200 KB total for all files

Exceeding any limit:
- Truncates the file content with a `[...truncated...]` notice
- Adds a user-visible warning message about what was truncated

### 5. File discovery: use the existing `list_files` driver or direct `fs.readdir`

**Chosen**: Direct `fs.readdir`/`glob`-based scanning in a new `src/utils/at-file-resolver.ts` for both file listing (web) and resolution. This avoids coupling the UI layer to the driver system.

**Alternative considered**: Reusing the `fs` driver's `list_files` tool. Rejected because the driver layer is designed for LLM tool calling, not internal UI autocomplete. The driver tools go through permission checks which would interfere with autocomplete.

## Risks / Trade-offs

- **[Risk] Large files blow up context**: A user could `@`-reference a 5MB log file. → **Mitigation**: Hard max 50KB per file with truncation. Warn user.
- **[Risk] Binary files**: User references a `.png` or `.pdf`. → **Mitigation**: Skip binary files (detected via extension or null bytes) with a warning. Only process known text extensions + utf-8 content.
- **[Risk] Web file listing latency**: Scanning the project directory from the server for every keystroke could be slow on large projects. → **Mitigation**: Debounce (150ms), limit listing to first 50 matches, use `fd`/`fdfind` if available (already supported by `CombinedAutocompleteProvider`).
- **[Risk] Symlink loops / permission errors**: Reading files can fail. → **Mitigation**: Catch errors per-file, report warnings for individual failures, don't fail the entire message.
