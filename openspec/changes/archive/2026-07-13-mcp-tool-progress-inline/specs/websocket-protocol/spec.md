## ADDED Requirements

### Requirement: tool_progress ServerEvent type
The WebSocket protocol SHALL include a `tool_progress` event type in the `ServerEvent` union. The event SHALL carry `name` (string, matching `tool_start`/`tool_end`), `progress` (number), `total` (optional number), and `message` (optional string).

#### Scenario: tool_progress event format
- **WHEN** server sends a `tool_progress` event with all fields
- **THEN** the JSON payload SHALL be `{ "type": "tool_progress", "name": "mcp__search", "progress": 45, "total": 100, "message": "Fetching..." }`

#### Scenario: tool_progress event without optional fields
- **WHEN** server sends a `tool_progress` event without `total` and `message`
- **THEN** the JSON payload SHALL be `{ "type": "tool_progress", "name": "mcp__fetch", "progress": 62 }`

## MODIFIED Requirements

### Requirement: Tool call lifecycle events
The protocol SHALL convey tool call start, progress, and end states, including the tool name, arguments, result preview, progress information, and error status. In addition to `tool_start` and `tool_end`, the protocol SHALL include `tool_progress` events emitted during long-running tool execution. The `ToolCallEntry` type used in `ConversationMessage` SHALL be imported from the shared module.

#### Scenario: Tool call starts
- **WHEN** the agent invokes a tool
- **THEN** server sends `{"type":"tool_start","name":"bash","args":{"command":"ls"}}`

#### Scenario: Tool call progress
- **WHEN** a running tool reports progress
- **THEN** server sends `{"type":"tool_progress","name":"mcp__search","progress":45,"total":100,"message":"Fetching page 3..."}`

#### Scenario: Tool call ends successfully
- **WHEN** a tool call completes without error
- **THEN** server sends `{"type":"tool_end","name":"bash","result":"file1.txt\nfile2.txt","isError":false}`

#### Scenario: Tool call ends with error
- **WHEN** a tool call fails
- **THEN** server sends `{"type":"tool_end","name":"bash","result":"command not found","isError":true}`
