## Why

Session titles pollute the `/session list` view with command/skill prefixes (e.g., `:apply fix bug` instead of `fix bug`) due to a regex that fails to match colons in command names like `/opsx:apply`. Additionally, titles freeze on the first substantive message and never evolve — a session that starts with "fix login" but later pivots to "redesign auth system" still shows the stale first topic.

## What Changes

- **Fix SLASH_COMMAND_RE**: add `:` to the character class so `/opsx:apply`, `/opsx:propose`, `/opsx:explore`, `/opsx:archive` are fully stripped
- **Reverse extraction order**: prefer the *last* qualifying non-command user message instead of the first, so titles naturally follow topic evolution
- **Filter noise phrases**: skip low-information messages like "thanks", "ok", "好的", "嗯" that shouldn't become titles
- **Minimum length gate**: require candidate messages to be ≥ 10 characters (was already implicit via the 3-char arg gate, now explicit for all paths)

## Capabilities

### New Capabilities

- `session-title-noise-filter`: Filter out low-information user messages (thanks/ok/single-word) from title candidates

### Modified Capabilities

- `session-title-extraction`: Change extraction strategy from "first qualified message" to "last qualified message"; fix slash-command regex to cover colon-containing commands; add minimum-length gate

## Impact

- **Code**: `src/session/manager.ts` — `extractSessionTitle()`, `isTitleBetter()`, `SLASH_COMMAND_RE`, and related helpers
- **Tests**: update existing title extraction tests to reflect new "last message wins" behavior
- **No API changes, no breaking changes to session file format**
