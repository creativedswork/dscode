# chiff-agent-loop Specification

## Purpose

轻量 Agent 循环引擎，驱动 CHIFF 各 Pass 的 LLM 自主探索。LLM 通过 tool_call 主动获取信息、通过 tool_result 接收结果，自主决定何时输出结构化 JSON。每个 Pass 是独立的 Agent 会话。

## ADDED Requirements

### Requirement: Agent Loop Execution

The system SHALL execute an Agent loop that iterates between LLM calls and tool execution until the Agent produces a valid structured output or reaches the soft limit.

The loop SHALL:
1. Call the LLM with accumulated messages (system + user + assistant + tool results)
2. If the LLM response contains `toolCalls`, execute them and append results
3. If the LLM response contains text only, attempt to extract and validate JSON
4. Terminate when JSON is valid against the output schema

#### Scenario: Agent explores with tools then outputs JSON

- **WHEN** the Agent is launched with access to `read_file`, `grep`, and `write_file` tools
- **AND** the task prompt instructs it to analyze data and output structured JSON
- **THEN** the Agent MAY call `read_file` to explore available files
- **AND** the Agent MAY call `grep` to search for patterns
- **AND** the Agent MAY call `write_file` to record intermediate notes
- **AND** eventually the Agent SHALL produce a text response containing valid JSON matching the output schema
- **AND** the loop SHALL terminate and return the parsed JSON

#### Scenario: Agent continues after tool result

- **WHEN** the Agent calls a tool and receives the result
- **THEN** the system SHALL append both the tool call and its result to the message history
- **AND** the system SHALL call the LLM again with the updated history
- **AND** the Agent MAY use the tool result to decide its next action

#### Scenario: Agent produces invalid JSON

- **WHEN** the Agent outputs text without tool calls, but the text does not contain valid JSON matching the schema
- **THEN** the system SHALL append a correction message: "输出不是合法的 JSON，请检查格式后重新输出。Schema: {schema}"
- **AND** the system SHALL call the LLM again
- **AND** if validation fails 3 times consecutively, the system SHALL terminate the loop and return null

### Requirement: Soft Limit Enforcement

The system SHALL enforce `maxToolCalls` as a soft limit on the number of tool invocations per Agent session.

#### Scenario: Agent approaches soft limit

- **WHEN** the Agent has made `maxToolCalls - 5` tool calls without producing valid JSON
- **THEN** the system SHALL append a warning: "剩余 tool call 次数有限，请尽快输出 JSON"
- **AND** the Agent MAY continue using tools

#### Scenario: Agent exceeds soft limit

- **WHEN** the Agent has made `maxToolCalls` tool calls without producing valid JSON
- **THEN** the system SHALL append a mandatory instruction: "已达到最大 tool call 次数，请立即输出 JSON，不要再调用工具"
- **AND** the Agent SHALL be given 5 more attempts to produce valid JSON without tool calls
- **AND** if still no valid JSON after 5 additional attempts, the loop SHALL terminate with null

### Requirement: Tool Sandbox

The system SHALL constrain Agent tool access to the CHIFF work directory (`~/.dscode/eval/{sessionId}/`) and its subdirectories.

#### Scenario: Agent reads within work directory

- **WHEN** the Agent calls `read_file` with a path like `library/skeleton.md`
- **THEN** the system SHALL resolve the path relative to the work directory root
- **AND** the system SHALL return the file content

#### Scenario: Agent attempts path traversal

- **WHEN** the Agent calls `read_file` with a path containing `../`
- **THEN** the system SHALL reject the call
- **AND** the tool result SHALL contain an error message: "路径超出工作目录范围"

#### Scenario: Agent uses grep within work directory

- **WHEN** the Agent calls `grep` with a pattern and path prefix `library/`
- **THEN** the system SHALL search only within the work directory
- **AND** the system SHALL return matching lines with file paths relative to the work directory

### Requirement: Progress Events

The system SHALL emit `ProgressEvent` callbacks during the Agent loop for real-time display.

Each `ProgressEvent` SHALL contain:
- `type`: "tool_call" | "thinking" | "output"
- `phase`: string identifying the current CHIFF phase (e.g., "SCAN", "ZOOM-Z1")
- `detail`: human-readable description of the current action
- `toolCallsSoFar`: cumulative count of tool calls in this session

#### Scenario: Progress on tool call

- **WHEN** the Agent invokes a tool
- **THEN** the system SHALL emit a `ProgressEvent` with `type: "tool_call"` and `detail` describing the tool and its argument (e.g., "read_file(library/skeleton.md)")
- **AND** `toolCallsSoFar` SHALL be incremented

#### Scenario: Progress on thinking

- **WHEN** the system is waiting for an LLM response
- **THEN** the system SHALL emit a `ProgressEvent` with `type: "thinking"` and `detail: "Agent 思考中..."`

#### Scenario: Progress on output

- **WHEN** the Agent produces valid JSON and the loop terminates
- **THEN** the system SHALL emit a `ProgressEvent` with `type: "output"` and `detail` summarizing the output (e.g., "输出完成 — 识别到 3 个 zones")

### Requirement: Independent Agent Sessions

Each CHIFF Pass SHALL spawn an independent Agent session with a fresh message history.

#### Scenario: Agent session isolation

- **WHEN** Pass 1 SCAN completes and Pass 2 ZOOM begins
- **THEN** the ZOOM Agent SHALL start with a clean message history containing only its own system prompt and task prompt
- **AND** the ZOOM Agent SHALL have no access to the SCAN Agent's tool call history
- **AND** the ZOOM Agent MAY read `notebook/scan-notes.md` to access SCAN's findings
