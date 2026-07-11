## Context

When users execute custom slash commands (e.g., `/opsx:apply`, user-defined commands via `.dscode/settings.json`), these expand into full prompt text that gets:
1. Sent to the agent (chat input)
2. Echoed in the conversation view via `addUserMessage(text)`

The echo currently renders the full text verbatim. For long prompts this is mostly noise — the user just composed or approved this text and doesn't need to re-read it. The conversation view's primary purpose is showing the AI's response.

The custom command path in `TuiApp.handleSubmit()`:
```
text.startsWith("/")
  → resolveCustomCommand(text) returns expanded
  → handleSubmit(expanded)  // recursive call, now treated as normal chat
  → ... → addUserMessage(expanded)  // full text echoed
```

## Goals / Non-Goals

**Goals:**
- Truncate long command prompt echo to first line + gray `(N chars)` count
- Short prompts (≤80 chars) remain fully visible
- Full text is still sent to the agent unchanged
- System commands (`/help`, `addInfo`, etc.) are completely unaffected

**Non-Goals:**
- User messages typed directly (not via commands) — defer to future collapsible feature
- AI response truncation — defer to future collapsible feature
- Configurable truncation threshold — hardcode 80 chars for now

## Decisions

### Decision 1: Truncate in handleSubmit, not in ConversationView

**Chosen**: Modify `TuiApp.handleSubmit()` to pass truncated text to `addUserMessage()`, keeping `ConversationView` generic.

**Rationale**: The truncation logic is specific to command prompts, not a general property of user messages. Keeping `addUserMessage` as a simple display primitive avoids mixing concerns. The command path already does special handling (expansion, recursion) — adding one more transformation is natural.

**Alternative considered**: Adding a `truncated` flag to `addUserMessage()`. Rejected because it leaks command-specific knowledge into the generic view layer.

### Decision 2: Truncation utility location

**Chosen**: Add a private `formatUserEcho(text: string)` method to `TuiApp` that applies truncation when text exceeds 80 chars.

**Rationale**: Simple, testable, no new module needed for a one-line transformation. Can be extracted later if reused elsewhere.

### Decision 3: Threshold and format

**Chosen**: 80-character threshold. Format: `you › <first line>\n      (N chars)` where `(N chars)` is gray/dimmed.

**Rationale**: 80 chars is the traditional terminal width; anything that wraps is "long enough" to warrant collapsing. The gray parenthetical on a separate line has minimal visual weight.

## Risks / Trade-offs

- **[Risk]** Users might miss seeing the full command text. → **Mitigation**: The gray count gives a clear signal of how much was sent. The first line provides context. Users can always retrieve the full text from history (up-arrow in editor).
- **[Risk]** 80-char threshold might be wrong for some use cases. → **Mitigation**: Start conservative; threshold can become configurable later if needed.
