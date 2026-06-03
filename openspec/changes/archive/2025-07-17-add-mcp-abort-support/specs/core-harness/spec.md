## MODIFIED Requirements

### Requirement: Harness exposes abort method
The `Harness` class SHALL expose a public `abort(): void` method. When called, it SHALL abort the visionAbortController (if one is active for in-progress image pre-processing) AND call `this.agent.abort()`. The agent's abort SHALL propagate into all in-flight tool executions including MCP tool calls via the AbortSignal passed to each `AgentTool.execute()`.

#### Scenario: Abort during image pre-processing
- **WHEN** `harness.abort()` is called while `promptWithImages()` is executing inside `imagePipeline.process()`
- **THEN** the vision/OCR call SHALL be aborted via `visionAbortController.abort()`
- **AND** `agent.abort()` SHALL also be called

#### Scenario: Abort during agent loop
- **WHEN** `harness.abort()` is called while the agent loop is running (no image pre-processing active)
- **THEN** `agent.abort()` SHALL be called
- **AND** no error SHALL be thrown

#### Scenario: Abort during MCP tool execution
- **WHEN** `harness.abort()` is called while an MCP tool is executing (via the agent loop)
- **THEN** the agent's abort signal SHALL propagate through `AgentTool.execute` → `MCPManager.buildAgentTool` → `MCPClient.callTool` → `MCPClient.request`
- **AND** the in-flight MCP request SHALL be cancelled (HTTP request destroyed, or stdio cancel notification sent)
- **AND** the MCP tool promise SHALL reject with an `AbortError`

#### Scenario: Abort when idle
- **WHEN** `harness.abort()` is called while nothing is running
- **THEN** the call SHALL complete without throwing
