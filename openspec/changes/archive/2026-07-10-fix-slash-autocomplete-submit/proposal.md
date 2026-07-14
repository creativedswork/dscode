## Why

When using `/` autocomplete in the TUI prompt editor, pressing Enter to select a command immediately executes it without giving the user a chance to add arguments. This is a usability bug: the pi-tui Editor intentionally falls through from autocomplete confirm to submit for slash commands, which makes the autocomplete feel broken — users expect selection to fill the command for editing, not fire it.

## What Changes

- **`HybridAutocompleteProvider`**: accept an `onSlashAutocomplete` callback that fires when `applyCompletion` completes a slash command
- **`TuiApp.handleSubmit`**: detect when a slash command was just autocompleted (via timestamp)、回填 editor 让用户继续编辑而不是立即执行
- No pi-tui library changes

## Capabilities

### New Capabilities
- `slash-autocomplete-fill-only`: slash command autocomplete selection (Enter) fills the command into the editor without submitting, consistent with Tab behavior

### Modified Capabilities
_None._ This is a pure UX fix, no spec-level requirement changes.

## Impact

- `src/ui/tui-app.ts` — `HybridAutocompleteProvider` class + `handleSubmit` method
- No API changes, no breaking changes
