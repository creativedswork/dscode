## Delta: mcp-tool-abort

Three new requirements added to `openspec/specs/mcp-tool-abort/spec.md`:

1. **MCPClient onAbort handler is exception-safe** — guarantees `reject()` always fires before cleanup operations, with try-catch around `sendNotification()` and `httpReq.destroy()`
2. **Aborted MCP tool sets terminate flag** — `MCPManager.buildAgentTool` sets `terminate: true` on AbortError; `harness.afterToolCall` provides fallback
3. **MCP child process is killed on abort (stdio transport)** — SIGTERM → 2s grace → SIGKILL for stuck stdio processes
