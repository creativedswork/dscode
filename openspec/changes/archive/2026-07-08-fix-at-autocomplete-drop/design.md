## Context

The TUI `HybridAutocompleteProvider.applyCompletion` method currently reconstructs the completed line as:

```
`${beforePrefix}${item.value}${suffix}${afterCursor}`
```

Where `beforePrefix` is text before the matched `@query` prefix, `item.value` is the bare file path from `listProjectFiles` (e.g., `src/index.ts`), and the `@` symbol from the original `prefix` is discarded.

This means:
- `@src/in` + Tab → `src/index.ts ` (the `@` is gone)
- ` @src/in` + Tab → `src/index.ts ` (both space and `@` are gone)

`resolveAtFileRefs` uses `/(?<!\S)@([^\s@]+)/g` to detect references. Without the `@`, the completed text is treated as a plain string and no file content is injected.

## Goals / Non-Goals

**Goals:**
- Preserve the `@` symbol (and any whitespace before it) when applying `@` file completions in the TUI
- Ensure completed `@` references remain detectable by `resolveAtFileRefs`

**Non-Goals:**
- Changing how `listProjectFiles` returns file paths
- Modifying `resolveAtFileRefs` detection logic
- Changing web UI autocomplete behavior (web UI handles `@` separately)

## Decisions

### Fix: Extract `@` position from prefix and rebuild

The fix locates the `@` within the original `prefix` and reconstructs the new line preserving everything before and including `@`:

```
const atIdx = prefix.indexOf("@");
const newLine = `${beforePrefix}${prefix.slice(0, atIdx)}@${item.value}${suffix}${afterCursor}`;
```

**Why this approach:**

| Approach | Result for ` Hello @src/in` | Correct? |
|----------|----------------------------|----------|
| Current: `${beforePrefix}${item.value}` | `Hellosrc/index.ts ` | ❌ |
| Simple fix: `${beforePrefix}@${item.value}` | `Hello@src/index.ts ` | ❌ (missing space) |
| Chosen: `${beforePrefix}${prefix.slice(0, atIdx)}@${item.value}` | `Hello @src/index.ts ` | ✅ |

Context on `prefix` structure: `getSuggestions` returns `atMatch[0]` from regex `/(?:^|[\s])@([^\s]*)$/`. When text is `"Hello @src/in"`, the match is `" @src/in"` — the non-capturing group `(?:^|[\s])` is part of the full match. So prefix is either `@query` (start-of-line) or ` @query` (after whitespace). The fix handles both cases.

**Alternative considered:** Change `listProjectFiles` to return paths with `@` already prepended. Rejected because it would contaminate the data layer — `listProjectFiles` is a generic file listing utility and shouldn't encode UI presentation.

## Risks / Trade-offs

- **Risk:** The `@` in the prefix is relied upon for the fix. If `prefix` somehow doesn't contain `@` (e.g., a future code change), the fix silently degrades by inserting an extra `@`. → **Mitigation:** The `if (prefix.startsWith("@"))` guard already ensures `@` is present in the prefix.
