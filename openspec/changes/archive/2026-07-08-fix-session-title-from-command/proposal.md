## Why

When users type slash commands in the prompt box (e.g., `/opsx:propose fix-session-title`), the session list displays the raw command text as the session title. This is meaningless — users can't distinguish sessions by their command content alone. As conversations grow, the title remains frozen at the first message, never reflecting what the session is actually about.

## What Changes

- **Strip command prefixes from session titles**: When deriving the initial title from the first user message, strip leading slash-command prefixes (everything before the first meaningful content). A message like `/opsx:propose fix-session-title` should yield title `fix-session-title` rather than the full command string.
- **Update titles beyond first message**: When the session accumulates more messages, extract a better title from the latest user question or the overall conversation context, rather than freezing at the first message forever.
- **Heuristic extraction fallback**: When LLM-based summarization is unavailable (no API call), use simple heuristics: prefer the most recent non-command user message, or the longest substantive user message.

## Capabilities

### New Capabilities
- `session-title-extraction`: Extracts meaningful, human-readable session titles from conversation content by stripping command prefixes and preferring substantive user messages over slash commands.

### Modified Capabilities
- `session-management`: Requirements for how session titles are derived from messages (currently the first message content is used verbatim; this changes to strip commands and consider later messages).

## Impact

- `src/session/manager.ts` — `saveSession()` title extraction logic
- `web/src/components/Sidebar.tsx` — displays session titles (no structural change, receives better titles)
- No API changes, no breaking changes to session file format
