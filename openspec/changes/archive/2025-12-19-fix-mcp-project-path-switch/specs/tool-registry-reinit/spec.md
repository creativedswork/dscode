## ADDED Requirements

### Requirement: ToolRegistry initialize supports re-entry
`ToolRegistry.initialize()` SHALL support being called multiple times. On each call, it SHALL clear all MCP-sourced entries from `allTools`, `deferredToolNames`, and `discoveredToolNames` before rebuilding the tool index from the current `DriverRegistry` state.

#### Scenario: Re-entry on same DriverRegistry
- **WHEN** `initialize()` is called a second time with no changes to DriverRegistry
- **THEN** `allTools` contains the same tool entries as after the first call; `deferredToolNames` and `discoveredToolNames` reflect fresh state

#### Scenario: Re-entry after MCP driver change
- **WHEN** `initialize()` is called after MCP drivers in DriverRegistry have been replaced (e.g., project path switch)
- **THEN** `allTools` contains the new MCP tool objects from the updated DriverRegistry, and no stale MCP tool entries from the old drivers remain

#### Scenario: Builtin and skill tools preserved
- **WHEN** `initialize()` is called multiple times
- **THEN** builtin driver tools and the skill tool remain unchanged in `allTools` and `baseToolNames`

#### Scenario: Discovered state resets on re-entry
- **WHEN** `initialize()` is called after tool discovery has occurred
- **THEN** `discoveredToolNames` is empty, requiring the agent to re-discover MCP tools via `search_tools`
