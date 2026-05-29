## Why

Model API calls in DSCode can fail unpredictably — transient network errors, rate limits, server timeouts, or provider outages. Currently, the system has `maxRetries: 0` in `streamFn`, meaning any transient error immediately terminates the agent turn with a `[error] Model error: terminated` message, losing the user's context and requiring a manual retry. This is a poor UX that breaks workflow continuity.

## What Changes

1. **Configurable Retry Settings**: Add a `retry` config section supporting `maxRetries`, `baseDelayMs`, `maxDelayMs`, and `retryableErrors` — loadable from settings.json and env vars.

2. **Enable pi-ai Built-in Retry**: Change `streamFn`'s `maxRetries: 0` to use the configured retry count, leveraging pi-ai's native retry with exponential backoff for streaming API calls.

3. **Agent-Level Retry for Non-Stream Errors**: Add a retry wrapper in the `agent_end`/`turn_end` event handler for errors that pi-ai's stream-level retry doesn't catch (e.g., tool execution errors that cascade, or errors after partial streaming output).

4. **UI Feedback During Retries**: Show retry progress in the TUI — count, delay, and error reason — so the user knows the system is recovering rather than hanging.

5. **Session Safety**: Ensure retries don't corrupt session state — messages must be rolled back to pre-turn state before retrying.

## Capabilities

### New Capabilities

- `model-retry`: Configurable retry mechanism for model API calls covering stream-level transient errors, agent-turn-level failures, and exponential backoff with UI feedback.

### Modified Capabilities

- (none — no existing specs are being modified)

## Impact

- **`src/core/harness.ts`**: Modify `streamFn` to use configurable `maxRetries`; add retry wrapper for agent loop errors; add retry-related UI calls.
- **`src/core/types.ts`**: Add `RetryConfig` interface; add `retry` field to `HarnessConfig`.
- **`src/core/config.ts`**: Load `retry` config from settings.json and env vars with sensible defaults.
- **`src/ui/backend.ts`** and **`src/ui/tui-backend.ts`**: Add `addRetry` method for UI feedback during retries.
- **`src/ui/tui-app.ts`** and **`src/ui/conversation.ts`**: Implement retry UI rendering (count, delay, error info).
- **`docs/coding-style.md`**: No changes needed.
