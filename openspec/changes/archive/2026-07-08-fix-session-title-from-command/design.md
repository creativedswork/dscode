## Context

`SessionManager.saveSession()` currently sets the session title from the first message's content verbatim. When the user's first message is a slash command like `/opsx:propose fix-session-title`, the title becomes the raw command string. The title is only set once — when it changes from "New session" — and never updated as the conversation grows.

The relevant code is in `src/session/manager.ts`, `saveSession()` lines 173-185:

```typescript
if (this.current.title === "New session") {
  const first = messages[0];
  const content = (first as any)?.content;
  if (Array.isArray(content)) {
    const textBlock = content.find((b: any) => b.type === "text");
    if (textBlock) {
      this.current.title = textBlock.text.slice(0, 60);
    }
  } else if (typeof content === "string") {
    this.current.title = content.slice(0, 60);
  }
}
```

No LLM is called for title extraction. The title is purely heuristic.

## Goals / Non-Goals

**Goals:**
- Strip `/command` prefixes from messages when deriving session titles
- Update session titles on subsequent saves when better content is available
- Keep the implementation purely heuristic — no LLM calls for title generation
- Backward compatible: existing sessions keep their current titles
- Max 60 characters, same as today

**Non-Goals:**
- LLM-based summarization of sessions (would require API calls, adds latency)
- Changing the session file format or metadata schema
- UI changes beyond displaying better titles
- Multi-language title extraction

## Decisions

### 1. Title extraction: strip slash commands, prefer non-command messages

**Decision**: Extract titles by scanning user messages in order, skipping slash-command-prefixed ones until a non-command message is found. If all messages are commands, strip the command prefix and use the remainder.

**Rationale**: Most slash commands follow the pattern `/command argument`. The argument is often descriptive (`/opsx:propose fix-session-title` → `fix-session-title`). Some commands have no argument (`/help`, `/reset`) — these should be skipped.

**Alternatives considered**:
- LLM summarization: Too heavy, adds latency and cost. Not appropriate for a simple title.
- Only using the first non-command message: Would miss the case where users start with a command then have substantive conversation.
- Keeping the first message as-is with no stripping: Current broken behavior.

### 2. Title updates: refresh on save when better content found

**Decision**: On every `saveSession()` call, attempt to derive a better title from the most recent non-command user message. If the derived title differs from the current one and is longer/more substantive, update it.

**Rationale**: The first user message may not represent the session well after the conversation evolves. A session that starts with `/help` but then has a 20-turn debugging session should show "debugging" in the title, not "help".

**Alternatives considered**:
- Never update: Freezes to first message, often wrong.
- Update on every save: Could thrash the title. Mitigated by only updating when the new candidate is more substantive (longer or more specific).

### 3. Command detection: regex for `/command` pattern

**Decision**: Use `/^\/[a-zA-Z][a-zA-Z0-9_-]*\s*/` to detect and strip slash commands.

**Rationale**: All dscode commands follow this pattern. Simple regex, no false positives.

### 4. Strip command argument, not just skip

**Decision**: When a message starts with a slash command, extract the argument after the command word and use it as the title candidate, rather than skipping the message entirely.

**Rationale**: `/opsx:propose fix-session-title` has a meaningful argument. Skipping it entirely loses good title material.

**Heuristic**: If the argument is ≥ 3 characters, use it. Otherwise skip to the next message.

## Risks / Trade-offs

- **[Risk] Title thrashing on long conversations**: Each save could produce a different title if the latest user message varies wildly.
  → **Mitigation**: Only update if the new candidate is ≥ 10% longer than the current title, or the current title still looks like a command remnant.

- **[Risk] Command arguments vary in quality**: Some command arguments are great titles (`fix-session-title`), others are not (`--web`).
  → **Mitigation**: Minimum length threshold (≥ 3 chars) and prefer messages that don't start with `-`.

- **[Risk] Existing sessions with command-based titles won't be retroactively fixed**: Only sessions saved after this change get better titles.
  → **Mitigation**: Acceptable trade-off. Session titles are ephemeral metadata, not critical data.

## Open Questions

- Should we also strip the `@` file-mention prefix if it appears at the start of a message? (Deferred — not in scope.)
