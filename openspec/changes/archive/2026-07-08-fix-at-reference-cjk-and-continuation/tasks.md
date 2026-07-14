## 1. Backend: CJK-aware @ detection and filtering

- [x] 1.1 Update `AT_FILE_RE` regex in `src/utils/at-file-resolver.ts` to accept CJK characters before `@` using range `\u2e80-\u9fff\uff00-\uffef`
- [x] 1.2 Add `isLikelyFilePath()` helper to classify captures as path-like vs prose
- [x] 1.3 Update `extractAtPaths()` to filter out captures that are pure CJK text (no `/`, `\`, `.ext`, or ASCII path chars)
- [x] 1.4 Add unit tests for CJK prefix scenarios (`的@src/main.ts`, `@src/main.ts`, `abc@src` should still reject)
- [x] 1.5 Add unit tests for CJK text filtering (`@我们` skipped, `@我们.txt` kept, `@src/中文` kept)

## 2. Frontend: CJK-aware autocomplete trigger

- [x] 2.1 Update autocomplete regex in `handleChange` (line 315) to accept CJK characters before `@`
- [x] 2.2 Update autocomplete regex in `navigateToDirectory` (line 106) to accept CJK characters before `@`
- [x] 2.3 Add path-likeness check before showing the file menu in `handleChange` to filter `@我们`-style false triggers
- [x] 2.4 Add path-likeness check in `navigateToDirectory` before proceeding

## 3. Frontend: Directory selection continuation

- [x] 3.1 Modify `insertFilePath` to not add trailing whitespace when selecting a directory
- [x] 3.2 Modify `insertFilePath` to not start a new `@` reference when selecting a directory (remove ` @` from keepMenu path)
- [x] 3.3 Ensure autocomplete menu stays open with the new directory prefix after directory selection (both Enter and Tab)
- [x] 3.4 Update `navigateToDirectory` to skip the `insertFilePath` indirection and handle directory continuation directly

## 4. Validation

- [x] 4.1 Manually verify `的@src/main.ts` shows autocomplete and resolves correctly in Web UI
- [x] 4.2 Manually verify `@我们` does NOT trigger autocomplete and is NOT resolved as file
- [x] 4.3 Manually verify directory drill-down (`@assets/` → select dir → `/` → select file) works end-to-end
- [x] 4.4 Run `npm test` to verify no regressions in existing at-file resolver tests
- [x] 4.5 Run `npm run typecheck` to verify no TypeScript errors
