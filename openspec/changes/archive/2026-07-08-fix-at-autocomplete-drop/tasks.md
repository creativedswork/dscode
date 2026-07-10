## 1. Fix @ preservation in autocomplete

- [x] 1.1 Update `HybridAutocompleteProvider.applyCompletion` in `src/ui/tui-app.ts` to preserve the `@` symbol when applying file completions, as specified in the design
- [x] 1.2 Run `npm run typecheck` to verify no type errors
- [x] 1.3 Manual verification: type `@` in TUI prompt, complete a file, confirm `@` remains in the inserted text
