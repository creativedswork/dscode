## Why

When a user completes an `@` file reference via autocomplete in the TUI, the `@` symbol is stripped from the result. The text "Hello @src/in" completing to "src/index.ts" produces "Hellosrc/index.ts" — losing both the leading space and the `@`. This causes `resolveAtFileRefs` to silently skip the file reference, turning it into a plaintext string that the LLM cannot act on.

## What Changes

- Fix `HybridAutocompleteProvider.applyCompletion` to preserve the `@` symbol (and any preceding whitespace) when applying `@` file completions in the TUI

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- **at-file-mention**: Update "Select file with Enter" and "Select file with Tab" scenarios to require that the inserted result preserves the `@` prefix, ensuring the file reference remains detectable by `resolveAtFileRefs`.

## Impact

- `src/ui/tui-app.ts`: `HybridAutocompleteProvider.applyCompletion` — one-line fix in the string assembly logic
- No API changes, no dependency changes, no breaking changes
