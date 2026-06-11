## 1. Fix tool name construction in manager.ts

- [x] 1.1 Change `mcp_${serverName}_${def.name}` to `mcp__${serverName}__${def.name}` in `buildAgentTool` (line 514)
- [x] 1.2 Change `mcp_${serverName}_${def.name}` to `mcp__${serverName}__${def.name}` in `getAppOnlyToolNames` (line 251)
- [x] 1.3 Change all `mcp_${name}` to `mcp__${name}` in `unregister` calls (lines 351, 452, 503)
- [x] 1.4 Change driver `name: mcp_${serverName}` to `name: mcp__${serverName}` in `registerDriver` (line 611)

## 2. Fix prefix extraction in tool-registry.ts

- [x] 2.1 Change `name.startsWith("mcp_")` to `name.startsWith("mcp__")` (line 130)
- [x] 2.2 Change `name.split("_").slice(0, 2).join("_")` to `name.split("__").slice(0, 2).join("__")` (line 131)

## 3. Verify

- [x] 3.1 Run `npm run typecheck` to ensure no type errors
- [x] 3.2 Run `npm test` to ensure no regressions
- [x] 3.3 Manually verify discoverable tools hint groups MCP tools by server correctly (check `buildDeferredToolsHint` output)
