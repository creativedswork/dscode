## Why

When users execute slash commands that expand into long prompts (custom commands like `/opsx:apply`), the full expanded text gets echoed verbatim into the conversation view. This content often spans dozens or hundreds of lines, pushing the AI's actual response out of view. The user already knows what they typed — the echo serves only as a contextual breadcrumb, not as primary content. System-level output (like `/help`) should remain fully visible since its output IS the answer, but command prompts sent to the agent should be visually compact.

## What Changes

- Add a `truncateForDisplay` utility that preserves the first line of text and appends a gray `(N chars)` count for long content
- In the custom command execution path (`handleSubmit`), echo the truncated version while the full expanded text goes to the agent unchanged
- System commands (`/help`, `/memory list`, `addInfo`, `addNotice`, `addWarning`, `addError`) remain completely unchanged — they always render in full

## Capabilities

### New Capabilities
- `tui-command-echo-truncation`: Smart truncation of command prompt echo in the TUI conversation view, with gray character count indicator. Only applies to slash commands that expand and pass text to the agent; system-level output is unaffected.

### Modified Capabilities
<!-- None — this is purely additive display behavior, no existing spec requirements change -->

## Impact

- `src/ui/conversation.ts` — add `truncateForDisplay()` utility method
- `src/ui/tui-app.ts` — modify the custom command branch in `handleSubmit()` to use truncated display text
- No API changes, no dependency changes, no breaking behavior
