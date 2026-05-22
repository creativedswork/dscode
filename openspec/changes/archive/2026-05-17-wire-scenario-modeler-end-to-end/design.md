## Context

The previous change `add-mcp-app-support-and-examples` created the core infrastructure (AppHostManager, sandbox, capability negotiation, tool filtering, TUI notification) and the `examples/scenario-modeler` project. However it left two gaps:

1. **No demo launch script** — the example requires multiple manual steps
2. **structuredContent not pushed to View** — `checkAndRegisterApp` registers the app but doesn't send tool result data to the sandbox, so the View opens blank

## Goals / Non-Goals

**Goals:**
1. `npm run demo` launches the full experience: server → dscode → TUI → URL → browser View with data
2. MCP pre-configured via `<project>/.dscode/settings.json`
3. Tool result's `structuredContent` pushed to View via SSE bridge
4. Demo script handles cleanup on exit

**Non-Goals:**
- Not adding a new CLI flag to dscode core
- Not changing the TUI framework
- Not modifying the View (mcp-app.html is correct as-is)

## Decisions

### 1. structuredContent forwarding: in Harness `checkAndRegisterApp`
**Choice**: Pass the tool call result alongside tool name in `checkAndRegisterApp`, extract `structuredContent`, and push via `AppHostManager.pushToApp()`.

**Flow**:
```
tool_execution_end (event.toolName, event.result)
  → checkAndRegisterApp(toolName, result)
    → detect uiInfo from toolName
    → fetchUiResource(html)
    → registerApp(html, csp)
    → pushToApp(app.id, { 
        jsonrpc: "2.0", 
        method: "ui/notifications/tool-result", 
        params: result   // includes structuredContent
      })
```

### 2. pushToApp: SSE write to all connected clients
**Choice**: Store SSE response objects in AppInstance, iterate and write on push.

**Risks**: SSE clients connect after data was pushed → View opens blank. Mitigation: View first fetches via `GET /api/app/:id/html`, then waits for SSE. But for this demo the timing should be fine since:
1. User sees the URL in TUI first
2. User opens browser (takes seconds)
3. By then, the tool result was already pushed via SSE while the user was opening the browser

### 3. Demo script: `npm run demo` with concurrent server + dscode
**Choice**: Use `concurrently` to run server and dscode together, with a small delay to let the server start first.

**Alternative**: A shell script that background-starts the server then foreground-starts dscode. Simpler but requires `bash` or `sh`.

**Decision**: Add `concurrently` as devDependency and use it in the demo script. Cross-platform and handles signal forwarding.

### 4. Initial prompt: environment variable
**Choice**: Pass initial prompt via env var `DSCODE_INITIAL_PROMPT`. If not set, user types manually.

**Alternative**: Modify dscode to accept `--prompt` flag. More invasive, not needed for demo.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| SSE timing: View connects after data pushed | Acceptable for demo; View would get data on next tool call anyway |
| concurrently adds dev dependency | Only for the example project, not dscode core |
| MCP config in `.dscode/settings.json` persists after demo | Document cleanup or use temp config |
