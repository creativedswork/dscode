## Why

The `@` file reference system has three gaps that make it unusable in Chinese-language contexts: (1) `@` preceded by Chinese characters isn't recognized as a file reference, (2) standalone `@中文文本` is incorrectly treated as a file path, and (3) selecting a directory via autocomplete breaks the continuation path — users can't drill into subdirectories without starting over. These issues make `@` references frustrating in CJK workflows.

## What Changes

- **Backend**: Relax `@` prefix regex to accept CJK characters before `@`, and filter out captures that are purely CJK text (no path separators or extensions)
- **Frontend**: Mirror the same CJK-aware regex and filtering in the autocomplete trigger logic
- **Frontend**: Fix directory-selection continuation — after selecting a directory, the autocomplete stays active for subdirectory/child-file selection instead of closing or starting a new `@` reference

## Capabilities

### New Capabilities

None. This change fixes existing `@` file reference behavior without introducing new capabilities.

### Modified Capabilities

- `at-file-mention`: Extend `@` reference detection to accept CJK character prefixes; add CJK-text filtering to prevent false positives; fix directory autocomplete continuation in Web UI.

## Impact

- `src/utils/at-file-resolver.ts` — `AT_FILE_RE` regex and `extractAtPaths` function
- `web/src/components/MessageInput.tsx` — autocomplete trigger regex (2 locations), `insertFilePath` and `navigateToDirectory` functions
