## Context

DSCode's agent loop calls model APIs via `streamFn` which passes options to pi-ai's `streamSimple`. Currently `maxRetries: 0` is hardcoded — any transient failure (network blip, rate limit, server 500) causes immediate `[error] Model error: terminated`, losing the turn.

The pi-ai library already supports client-side retry with exponential backoff via `maxRetries`, `timeoutMs`, and `maxRetryDelayMs` in `SimpleStreamOptions`. However, some errors happen at a higher level in the agent loop (e.g., tool execution errors cascade into model errors, or the stream partially succeeds before failing), requiring agent-turn-level retry with message rollback.

## Goals / Non-Goals

**Goals:**
- Transient API errors during streaming are retried transparently using pi-ai's built-in mechanism
- Agent-turn-level failures (post-stream) trigger a full turn retry with message rollback
- Retries are configurable via settings.json and env vars with sensible defaults
- User sees clear UI feedback during retries (attempt count, delay, error reason)
- Session state is never corrupted — messages are always rolled back to pre-turn state before retrying

**Non-Goals:**
- Not covering retry for vision model API calls (separate change)
- Not covering retry for MCP server connections (separate concern)
- Not implementing persistent queue or dead-letter mechanisms

## Decisions

### Decision 1: Two-Layer Retry Architecture

Three failure modes exist at different levels:
1. **Stream-level errors** (network timeout, 429 rate limit, 500 server error) — handled by pi-ai's built-in retry in `streamFn`
2. **Agent-turn-level errors** (stream emits `error` event with `stopReason: "error"`) — handled by a new retry wrapper in the agent event handler
3. **Tool-execution cascade** (tool call succeeds but model then fails to process result) — also caught by agent-turn-level retry

**Implementation:**
- Stream-level: change `maxRetries: 0` to `config.retry.maxRetries` in `streamFn`
- Agent-turn-level: intercept `turn_end` events where `stopReason === "error"`, rollback agent state to pre-turn snapshot, and re-invoke `agent.prompt()` with the original input

**Alternatives considered:**
- *Single retry at the stream level only* → rejected because `streamSimple` retry only covers the streaming phase, not the full agent turn (tool call + model response). Some errors occur after streaming completes.
- *Retry via wrapping the entire agent loop* → rejected because it's complex and risks duplicate message entries.

### Decision 2: Exponential Backoff with Jitter

Use pi-ai's default exponential backoff for stream-level retries. For agent-turn-level retries, implement a simple capped exponential backoff with jitter:
- Base delay: `retry.baseDelayMs` (default 1000ms)
- Delay for attempt N: `min(baseDelayMs * 2^(N-1) + random(0, 500), retry.maxDelayMs)`
- Default `maxDelayMs`: 30_000ms

### Decision 3: Rollback via Agent State Snapshot

The `Agent` from pi-agent-core exposes `state.messages`. Before each `agent.prompt()` call in `promptAndSave`, take a snapshot of the current messages array length. On retry:

1. Truncate `agent.state.messages` to pre-turn length
2. Clear any partial assistant message state in the agent
3. Re-invoke `agent.prompt()` with the exact same input
4. The `promptAndSave` try/finally ensures session is saved after retries exhaust

**Edge case**: If a tool was executed in the failed turn, its result is lost on rollback — the model will re-invoke the tool on retry. This is acceptable because tool calls are idempotent for read-only operations, and write operations should have been committed by the tool itself.

### Decision 4: Config Structure

Add to `HarnessConfig`:
```typescript
interface RetryConfig {
  maxRetries: number;       // max retry attempts (default 3)
  baseDelayMs: number;      // base delay for exponential backoff (default 1000)
  maxDelayMs: number;       // max delay cap (default 30000)
  retryOnTimeout: boolean;  // retry on timeout errors (default true)
  retryOnRateLimit: boolean;// retry on 429 errors (default true)
  retryOnServerError: boolean; // retry on 5xx errors (default true)
}
```

Loaded from:
- Environment variables: `DSCODE_RETRY_MAX_RETRIES`, `DSCODE_RETRY_BASE_DELAY_MS`, etc.
- `settings.json`: `retry.maxRetries`, `retry.baseDelayMs`, etc.
- Defaults: `{ maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000, retryOnTimeout: true, retryOnRateLimit: true, retryOnServerError: true }`

### Decision 5: UI Feedback Contract

New method on `UiBackend`:
```typescript
interface UiBackend {
  // ... existing methods
  addRetry(info: { attempt: number; maxRetries: number; delayMs: number; error: string; level: 'stream' | 'turn' }): void;
}
```

Rendered in TUI as a dim colored line (e.g., yellow/warning tone):
```
↻ Retry 1/3 in 2s... (rate limit exceeded) [stream]
↻ Retry 2/3 in 4s... (server error) [turn]
✗ All retries exhausted
```

## Risks / Trade-offs

- **[Rollback risk] Message rollback could lose tool results** → Mitigation: tools that perform writes are expected to commit side effects themselves (e.g., `write_file` actually writes). The rollback only affects the agent's message history, not actual side effects.
- **[Infinite retry risk] A truly broken model config causes infinite retry loops** → Mitigation: hard cap at `maxRetries` with no override. User sees "All retries exhausted" and must investigate.
- **[Abort signal confusion] User might abort during a retry delay** → Mitigation: check `AbortSignal.aborted` before each retry attempt. User abort immediately stops retries.
- **[Cost concern] Retries consume additional tokens** → Mitigation: retries are limited (default 3 max). The alternative — user manually re-typing their prompt — would also cost tokens.

## Open Questions

- Should retry on 401 (auth) errors be explicitly disabled by default? (Currently: yes — retryOnAuth is not in config, auth errors are never retried)
- Should the agent-turn-level retry restore the full tool registry state? (Current decision: no — tools are rebuilt each turn via `buildToolsForRequest`)
