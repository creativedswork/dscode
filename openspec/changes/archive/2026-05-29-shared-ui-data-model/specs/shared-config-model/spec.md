## ADDED Requirements

### Requirement: Canonical ConfigData type
The shared module SHALL define a canonical `ConfigData` type representing the current harness configuration as exposed to UIs.

#### Scenario: Config fields
- **WHEN** configuration is sent to the UI
- **THEN** `ConfigData` includes `provider`, `modelId`, `apiKey` (masked), `thinkingLevel`, `projectPath`, `maxTokens`, `providers[]`, `models[]`, optional `vision`, `visionProviders[]`, `visionModels[]`

### Requirement: Canonical SessionInfo type
The shared module SHALL define a canonical `SessionInfo` type representing session metadata for the session list.

#### Scenario: Session fields
- **WHEN** a session is listed in the UI
- **THEN** `SessionInfo` includes `id`, `title`, `createdAt`, `updatedAt`, `modelProvider`, `modelId`, `projectPath`, `preview`, `messageCount`

### Requirement: Canonical McpServerInfo type
The shared module SHALL define a canonical `McpServerInfo` type representing an MCP server's connection state.

#### Scenario: MCP server fields
- **WHEN** MCP server info is displayed
- **THEN** `McpServerInfo` includes `name`, `description`, `status` (`"connected" | "connecting" | "error" | "disconnected"`), optional `error`, `toolCount`, `tools: McpToolInfo[]`, optional `transport`, optional `protocolVersion`

### Requirement: Canonical McpToolInfo type
The shared module SHALL define a canonical `McpToolInfo` type representing a single MCP tool.

#### Scenario: MCP tool fields
- **WHEN** an MCP tool is listed
- **THEN** `McpToolInfo` includes `name`, `label`, `description`, `state` (`"loaded" | "discoverable"`)

### Requirement: All config types imported from shared module
Both the server-side protocol (`src/ui/web/protocol.ts`) and the Web client types (`web/src/types/index.ts`) SHALL import `ConfigData`, `SessionInfo`, `McpServerInfo`, `McpToolInfo` from the shared module.

#### Scenario: Server protocol imports shared types
- **WHEN** `protocol.ts` defines `ServerEvent` union members
- **THEN** it imports `ConfigData`, `SessionInfo`, `McpServerInfo`, `ConversationMessage`, `ToolCallEntry` from `../shared/types.js`

#### Scenario: Web client imports shared types
- **WHEN** `web/src/types/index.ts` is compiled
- **THEN** it re-exports canonical types from the shared module via Vite alias
