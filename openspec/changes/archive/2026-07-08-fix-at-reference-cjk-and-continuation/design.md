## Context

The `@` file reference system has two regex-based detection layers — the backend (`at-file-resolver.ts`) scans submitted messages globally, and the frontend (`MessageInput.tsx`) triggers the autocomplete menu during typing. Both use regexes that require whitespace or start-of-string before `@`, and both blindly accept whatever follows `@` as a potential file path.

Three issues arise in CJK workflows:
1. Chinese characters preceding `@` (e.g., `的@src/main.ts`) aren't whitespace, so `@` isn't recognized
2. Chinese text after `@` (e.g., `@我们`) is treated as a file path, producing confusing not-found warnings
3. After selecting a directory from autocomplete, trailing spaces or stray `@` characters break continuation, preventing users from drilling into subdirectories

## Goals / Non-Goals

**Goals:**
- Accept `@` references preceded by CJK characters (not just whitespace/start-of-string)
- Reject `@` captures that are purely CJK text without path-like structure
- Keep autocomplete active when user selects a directory and types the next path segment
- Maintain backward compatibility — all existing `@` usage patterns continue to work

**Non-Goals:**
- Full natural-language understanding of `@` intent
- Support for `@` inside email addresses (this is explicitly blocked)
- Changing the file resolution pipeline beyond detection/filtering
- TUI autocomplete behavior (TUI uses pi-tui's `CombinedAutocompleteProvider`, which has its own matching logic)

## Decisions

### 1. Unicode range for CJK detection

**Choice**: Use the character range `\u2e80-\u9fff\uff00-\uffef` to match CJK and full-width characters.

```
\u2e80-\u9fff  →  CJK Radicals, Symbols, Hiragana, Katakana, 
                 Hangul, Unified Ideographs (core Chinese/Japanese/Korean)
\uff00-\uffef  →  Full-width forms, half-width katakana
```

**Alternatives considered:**
- `\p{Script=Han}` (Unicode property escape) — cleaner but requires `u` flag and may have inconsistent support in older Node/browser runtimes
- Character-by-character `charCodeAt` range check — more precise but slower and verbose
- Simpler CJK range (`\u4e00-\u9fff` only) — misses Hiragana, Katakana, full-width punctuation, breaking Japanese/Korean support

**Rationale**: The chosen range is well-established, covers all major CJK scripts, and works without Unicode property escapes.

### 2. CJK-text filtering strategy

**Choice**: After regex extraction, classify each `@` capture as "looks like a path" or "looks like prose" using a simple heuristic:

```
Looks like a path (keep):
  - Contains '/' or '\'
  - Contains '.' followed by 1-6 alphanumeric characters (file extension pattern)
  - Contains any ASCII alphanumeric, '-', or '_' without being pure CJK

Looks like prose (skip):
  - Consists entirely of CJK characters + CJK punctuation, no ASCII alphanumeric, no '/', no '.'
```

**Alternatives considered:**
- Regex-only solution (more complex regex to require at least one ASCII path char) — fragile, hard to read
- File-system check (stat each capture to see if it exists) — expensive, potential for path traversal abuse
- Keyword-based (whitelist of known directories) — doesn't scale

**Rationale**: The heuristic is fast (pure string check), handles all edge cases from our exploration, and the cost of a false negative (a real file called `我们`) is negligible compared to the cost of false positives (every `@我们` producing a confusing not-found warning).

### 3. Directory continuation behavior

**Choice**: When user selects a directory from autocomplete (Enter or Tab):
- Extend the current `@` reference to `@dirPath/` (no trailing space)
- Keep the autocomplete menu open with `prefix` set to `dirPath/`
- Place cursor immediately after `/`

**Current behavior (broken):**
```
Enter:  @assets/ ← trailing space, menu closes, next keystroke breaks @ref
Tab:    @assets/ @ ← new independent @ref, menu resets to root
```

**New behavior:**
```
Enter:  @assets/ ← no trailing space, menu stays with prefix="assets/"
Tab:    @assets/ ← same as Enter for directory continuation
```

**Alternative considered:**
- Enter closes menu, Tab keeps it open — the traditional distinction. Rejected because when browsing a path hierarchy, both keys should support continued navigation. The distinction (Enter = commit, Tab = continue) is counterintuitive for file-path browsing.

### 4. Regex symmetry between frontend and backend

**Choice**: Both layers use the same character-class logic but expressed differently due to JS regex API differences:

```
Backend (negative lookbehind):
  /(?<![^\s\u2e80-\u9fff\uff00-\uffef])@([^\s@]+)/g

Frontend (positive alternation + end-anchor):
  /(?:^|[\s\u2e80-\u9fff\uff00-\uffef])@("([^"]*)"?|([^\s]*))$/
```

The character class `[\s\u2e80-\u9fff\uff00-\uffef]` is identical in both, ensuring consistent `@` detection.

## Risks / Trade-offs

- **[Risk] The CJK range may miss some edge-case scripts** (e.g., Yi, Naxi) → Mitigation: These are rare in programming contexts; we can expand the range later if needed
- **[Risk] Files named purely in CJK without extensions won't be referenceable** (e.g., `@配置`) → Mitigation: This is intentional — pure CJK files are rare and the false-positive cost outweighs the convenience. Users can still reference via `@./配置` if needed
- **[Risk] Tab key behavior change may confuse users who expect Tab to start a new @ref** → Mitigation: Tab on a directory was already broken (it started a new root-level ref, not nested navigation). The new behavior is strictly more useful
- **[Trade-off] For `insertFilePath`, Enter and Tab now behave identically for directories** — This simplifies the API but removes the ability to "commit the directory and add another @ref" in one keystroke. Users can still manually type a space + `@` for a new reference

## Open Questions

- None. All design decisions have been resolved through exploration of the current codebase.
