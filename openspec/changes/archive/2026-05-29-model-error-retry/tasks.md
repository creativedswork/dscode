## 1. Add RetryConfig types and config loading

- [x] 1.1 Add `RetryConfig` interface to `src/core/types.ts` with fields: `maxRetries`, `baseDelayMs`, `maxDelayMs`, `retryOnTimeout`, `retryOnRateLimit`, `retryOnServerError`
- [x] 1.2 Add `retry` field to `HarnessConfig` in `src/core/types.ts`
- [x] 1.3 Add retry config loading in `src/core/config.ts` (from settings.json and env vars `DSCODE_RETRY_*`)
- [x] 1.4 Add retry defaults in `loadConfig()` return value

## 2. Enable pi-ai stream-level retry

- [x] 2.1 In `src/core/harness.ts`, change `streamFn` `maxRetries: 0` to `maxRetries: self.config.retry.maxRetries`
- [x] 2.2 Pass `maxRetryDelayMs` to `streamFn` options from `self.config.retry.maxDelayMs`

## 3. Implement agent-turn-level retry

- [x] 3.1 Add message state snapshot logic: before each `agent.prompt()` call in `promptAndSave`, record the current `agent.state.messages.length`
- [x] 3.2 Add retry logic in `promptAndSave` that rolls back messages and re-prompts when `stopReason === "error"`
- [x] 3.3 Implement exponential backoff with jitter for turn-level retry delays in `computeRetryDelay()`
- [ ] 3.4 Check `AbortSignal` before each retry attempt to respect user cancellation (deferred — requires signal plumbing)
- [x] 3.5 Distinguish transient errors (retryable) from permanent errors (auth, invalid model) using `isRetryableError()`

## 4. Add UI feedback for retries

- [x] 4.1 Add `addRetry(info)` method to `UiBackend` interface in `src/ui/backend.ts`
- [x] 4.2 Implement `addRetry` in `TuiBackend` (delegate to TuiApp)
- [x] 4.3 Implement `addRetry` rendering in `TuiApp` / `ConversationView` with yellow/warning color for in-progress and red for exhausted
- [x] 4.4 Wire retry UI calls in harness when stream-level or turn-level retry events occur (via `promptAndSave`)

## 5. Ensure session safety

- [x] 5.1 `promptAndSave` saves only after retries are exhausted or the turn succeeds
- [x] 5.2 `trySaveSession` is called only after retries are exhausted or the turn succeeds
- [x] 5.3 TypeScript check passes; no duplicate messages in session save path

## 6. Verification

- [x] 6.1 `npm run typecheck` passes with no errors
- [ ] 6.2 `npm start` launches without config errors; `/config` shows retry settings
- [ ] 6.3 Manual testing: simulate a transient error scenario and verify retry appears in TUI
