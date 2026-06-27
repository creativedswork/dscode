## MODIFIED Requirements

### Requirement: HarnessEvent complete event catalog

The `HarnessEvent` discriminated union SHALL include all event types in the catalog: LLM streaming (`llm:thinking:delta`, `llm:text:delta`, `llm:retry`, `llm:usage`), Tool (`tool:start`, `tool:end`), Turn lifecycle (`turn:start`, `turn:streaming:start`, `turn:streaming:end`, `turn:end`, `turn:abort`, `turn:error`), Processing (`processing:start`, `processing:stop`), Session (`session:created`, `session:loaded`, `session:saved`, `session:deleted`), UI (`message:user`, `ui:info`, `ui:error`, `ui:warning`, `ui:image:pending`, `ui:conversation:clear`, `ui:focus:editor`), Config (`config:change`), and MCP (`mcp:state`, `mcp:browser:open`, `mcp:app:registered`).

#### Scenario: Discriminated union type-checking

- **WHEN** a handler is registered for `"tool:start"`
- **THEN** TypeScript SHALL infer the handler parameter type as `{ type: "tool:start"; name: string; args: unknown }`
- **AND** SHALL reject access to properties from other event types (e.g., `delta`)

#### Scenario: Every event has a unique type string

- **WHEN** the `HarnessEvent` type is inspected
- **THEN** no two union members SHALL have the same `type` literal value

#### Scenario: turn:end usage carries full token and cost data

- **WHEN** the `turn:end` event is emitted
- **THEN** its `usage` field SHALL be of type `{ input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: { total: number } } | undefined`
- **AND** the `usage.input` field SHALL contain input token count
- **AND** the `usage.output` field SHALL contain output token count
- **AND** the `usage.cacheRead` field SHALL contain cache read token count
- **AND** the `usage.cacheWrite` field SHALL contain cache write token count
- **AND** the `usage.total` field SHALL contain total token count
- **AND** the `usage.cost.total` field SHALL contain the API cost in USD
