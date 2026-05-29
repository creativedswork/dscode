# model-retry Specification

## Purpose
Define the requirements for automatic retry of model API calls when transient errors occur during the agent conversation loop.

## Requirements

### Requirement: Stream-level retry uses pi-ai built-in mechanism
The agent harness SHALL configure `streamFn` with `maxRetries` and `maxRetryDelayMs` from `HarnessConfig.retry`, instead of the current hardcoded `maxRetries: 0`. pi-ai's built-in exponential backoff retry SHALL handle transient errors during the API streaming phase (network timeouts, rate limits, server errors).

#### Scenario: Transient network error triggers retry
- **WHEN** the model API call encounters a transient network error (e.g., socket hang-up, DNS failure) during streaming
- **AND** `retry.maxRetries > 0`
- **THEN** pi-ai SHALL retry the request with exponential backoff after the configured delay
- **AND** the agent loop SHALL continue without emitting a turn-level error

#### Scenario: Rate limit (429) triggers retry
- **WHEN** the model API returns HTTP 429 (rate limit exceeded)
- **AND** `retry.retryOnRateLimit` is true
- **THEN** pi-ai SHALL retry after waiting for the retry-after duration or the configured base delay, whichever is longer

#### Scenario: Server error (5xx) triggers retry
- **WHEN** the model API returns HTTP 500, 502, 503, or 504
- **AND** `retry.retryOnServerError` is true
- **THEN** pi-ai SHALL retry with exponential backoff

### Requirement: Agent-turn-level retry for post-stream errors
When the streaming phase completes but the agent turn fails (e.g., `stopReason: "error"` in the `turn_end` event), the harness SHALL attempt a full turn retry. This covers errors that pi-ai's stream-level retry doesn't catch, including partial streaming failures and tool-execution cascade errors.

#### Scenario: Stream ends with error, triggers retry
- **WHEN** `turn_end` event is emitted with `stopReason === "error"`
- **AND** the turn has not exceeded `retry.maxRetries`
- **THEN** the harness SHALL roll back the agent's message state to the pre-turn snapshot
- **AND** re-invoke `agent.prompt()` with the original user input
- **AND** notify the UI with retry progress

#### Scenario: Non-retryable error skips retry
- **WHEN** `turn_end` event is emitted with `stopReason === "error"`
- **AND** the error is a non-transient type (e.g., authentication failure, invalid model ID)
- **THEN** the harness SHALL NOT retry
- **AND** SHALL display the error to the user immediately

#### Scenario: Max retries exhausted
- **WHEN** all retry attempts have been exhausted for a turn
- **THEN** the harness SHALL display "All retries exhausted" with the last error message
- **AND** SHALL save the session with the failed state so the user can review

### Requirement: Retry config is configurable
The retry behavior SHALL be configurable through a `retry` section in `settings.json` or via environment variables. Configuration SHALL be loaded at startup and merged with sensible defaults.

#### Scenario: Custom retry config from settings.json
- **WHEN** `retry.maxRetries` is set to `5` in `settings.json`
- **THEN** the harness SHALL attempt up to 5 retries instead of the default 3

#### Scenario: Env var overrides config file
- **WHEN** `DSCODE_RETRY_MAX_RETRIES` environment variable is set to `2`
- **AND** `settings.json` has `retry.maxRetries` set to `5`
- **THEN** the environment variable value (`2`) SHALL take precedence

#### Scenario: Default config values are used when not configured
- **WHEN** no retry configuration is provided in settings.json or env vars
- **THEN** the harness SHALL use defaults: `maxRetries: 3`, `baseDelayMs: 1000`, `maxDelayMs: 30000`, `retryOnTimeout: true`, `retryOnRateLimit: true`, `retryOnServerError: true`

### Requirement: Retry uses exponential backoff with jitter
Agent-turn-level retries SHALL use capped exponential backoff with jitter to avoid thundering herd problems.

#### Scenario: Delay increases exponentially
- **WHEN** a retry is the Nth attempt (1-indexed)
- **THEN** the delay SHALL be `min(baseDelayMs * 2^(N-1) + random(0, 500), maxDelayMs)`
- **AND** the delay SHALL NOT exceed `retry.maxDelayMs`

#### Scenario: Backoff capped at maxDelayMs
- **WHEN** the computed exponential delay exceeds `retry.maxDelayMs`
- **THEN** the actual delay SHALL be capped at `retry.maxDelayMs`

### Requirement: User sees retry progress in UI
The TUI SHALL display retry progress so the user understands the system is recovering rather than hanging.

#### Scenario: Retry attempt displayed in TUI
- **WHEN** a retry is initiated for either stream-level or turn-level error
- **THEN** the TUI SHALL show a line like `↻ Retry 2/3 in 4s... (server error) [turn]`
- **AND** the line SHALL use a distinct color (e.g., yellow/warning tone) to differentiate from regular info messages

#### Scenario: Retry exhausted shown in TUI
- **WHEN** all retry attempts are exhausted
- **THEN** the TUI SHALL display `✗ All retries exhausted` with the last error message
- **AND** the line SHALL use error color (red)

### Requirement: Session state is protected during retries
Before each `agent.prompt()` call, the harness SHALL snapshot the current message length. On retry, messages SHALL be rolled back to the snapshot position to prevent duplicate or corrupted message sequences in the session history.

#### Scenario: Message rollback on retry
- **WHEN** a turn-level retry is triggered
- **THEN** `agent.state.messages` SHALL be truncated to the pre-turn length
- **AND** any partial assistant message state SHALL be cleared
- **AND** on session save, only the final (successful) turn's messages SHALL be persisted

#### Scenario: User abort cancels retry
- **WHEN** the user presses Ctrl+C during a retry delay
- **THEN** the retry SHALL be immediately aborted
- **AND** the turn SHALL end with `stopReason: "aborted"`
