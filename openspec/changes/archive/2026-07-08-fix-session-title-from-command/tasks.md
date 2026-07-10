## 1. Core Implementation

- [x] 1.1 Add `extractSessionTitle()` helper function in `src/session/manager.ts` that strips slash command prefixes, prefers non-command user messages, and truncates to 60 chars
- [x] 1.2 Add `isCommandMessage()` helper to detect messages starting with `/command` pattern
- [x] 1.3 Add `isTitleBetter()` comparison to determine if a new title candidate is more substantive than the current title

## 2. Integrate into saveSession

- [x] 2.1 Replace the `if (this.current.title === "New session")` block with a call to `extractSessionTitle()` that runs on every save
- [x] 2.2 Only update `this.current.title` when `isTitleBetter()` returns true for the new candidate
- [x] 2.3 Ensure titles derived from non-command messages are not replaced by shorter command-argument titles

## 3. Verify and Test

- [x] 3.1 Run existing tests to ensure no regressions (`npm test`) — all session tests pass
- [x] 3.2 Manual test: create session with `/opsx:propose fix-something` — verify title is `fix-something`
- [x] 3.3 Manual test: create session with `/help` then substantive message — verify title uses the substantive message
- [x] 3.4 Manual test: verify title updates when conversation evolves from command to substantive discussion
