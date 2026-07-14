## 1. Core Implementation

- [x] 1.1 Add `formatUserEcho(text: string): string` method to `TuiApp` that truncates text longer than 80 chars to first line + gray `(N chars)` count
- [x] 1.2 Modify the custom command branch in `handleSubmit()` to call `formatUserEcho` before `addUserMessage()`, while still sending full text to the agent

## 2. Verification

- [x] 2.1 Manually test with a short custom command (≤80 chars) — verify full text displayed
- [x] 2.2 Manually test with a long custom command (>80 chars) — verify truncation + gray count
- [x] 2.3 Manually test with `/help` and other built-in commands — verify full output unaffected
- [x] 2.4 Run `npm run typecheck` to ensure no compilation errors
