## Why

Currently `examples/scenario-modeler/` only starts an MCP server — users must manually configure dscode, start the TUI separately, and open the sandbox URL in a browser. The end-to-end flow (server → dscode → TUI notification → browser View) is not demonstrable. This change wires it all together so `npm run demo` launches the full experience.

## What Changes

- **One-command demo**: `npm run demo` starts the MCP server + launches dscode TUI with pre-configured MCP connection
- **Pre-configured MCP**: `.dscode/settings.json` with scenario-modeler server URL for automatic connection
- **structuredContent push to View**: `AppHostManager` exposes `pushToApp()` method; `checkAndRegisterApp` pushes tool result's `structuredContent` to the sandbox View via SSE so the browser displays the interactive chart
- **TUI pre-population**: Option to inject an initial prompt so the user doesn't need to type it manually

## Capabilities

### New Capabilities
- `app-host-push`: AppHostManager can push messages (tool results) to connected sandbox View clients via SSE
- `harness-tool-result-forward`: Tool execution results with structuredContent are forwarded to registered MCP App Views

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Modified**: `src/apps/host.ts` (pushToApp method), `src/core/harness.ts` (checkAndRegisterApp passes tool result)
- **New**: `examples/scenario-modeler/.dscode/settings.json` (MCP config), `examples/scenario-modeler/start-demo.sh` (or `npm run demo` script)
- **Modified**: `examples/scenario-modeler/package.json` (new demo script)
- **No new dependencies**
