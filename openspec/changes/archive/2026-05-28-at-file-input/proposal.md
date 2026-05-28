## Why

Users frequently need to reference project files in their prompts ("look at @src/core/main.ts and explain..."). Currently they must manually type or copy-paste full file paths, which is slow and error-prone. An `@file` autocomplete — ubiquitous in modern coding assistants (Cursor, Copilot, Claude Code) — lets users quickly find and reference files inline, and have their contents automatically injected into the prompt context.

## What Changes

- **New `@file` autocomplete in TUI input**: Typing `@` in the editor triggers a fuzzy-matching file picker dropdown drawn from the project directory, navigable via arrow keys, with Enter/Tab to insert the selected relative path.
- **New `@file` autocomplete in Web UI input**: Typing `@` in the `<textarea>` triggers a dropdown popover with the same fuzzy-matching file picker behavior, navigable via keyboard or mouse.
- **File reference resolution on submit**: When a message is sent, any `@path/to/file` references in the text are resolved to the actual file contents and injected as structured context into the prompt (replacing or augmenting the raw `@path` text), so the model sees the file contents directly.
- **Configurable max file size & max files**: Limits to prevent blowing up the context window with large or too many files. Exceeded limits produce a user-visible warning and truncation or omission.
- **Both UIs share the same resolution logic**: A single `resolveAtFileReferences(projectPath, text)` function in a shared module handles path resolution, file reading, size capping, and context injection.

## Capabilities

### New Capabilities
- `at-file-mention`: TUI and Web UI input boxes support `@`-triggered fuzzy file path autocomplete, and submitted messages resolve `@file` references to file contents for the LLM prompt.

### Modified Capabilities
- `web-frontend`: Input area scenario for autocomplete is extended to cover `@file` mentions in addition to `/slash` commands.

## Impact

- **TUI**: `src/ui/tui-app.ts` (autocomplete provider wiring, handleSubmit resolution), `src/ui/commands.ts` or new shared `src/ui/at-file.ts` (resolution logic)
- **Web UI**: `web/src/components/MessageInput.tsx` (autocomplete dropdown UI + resolvable state), `web/src/types/index.ts` (potential new `contextFiles` field in `ClientCommand`), `web/src/hooks/useWebSocket.ts` (no change)
- **Web protocol**: `src/ui/web/protocol.ts` `ClientCommand` type gains optional `contextFiles` field; `src/ui/web/web-backend.ts` handles resolution server-side
- **Shared utilities**: New `src/utils/at-file-resolver.ts` for filesystem scanning + file reading + resolution
- **No breaking changes**: all existing APIs unchanged
