## 1. Dry-Run Mode

- [x] 1.1 Add `dry_run` parameter to edit tool schema and type definitions
- [x] 1.2 Implement dry-run path in edit pipeline: execute full validation (anchor resolution, disambiguation, entropy filter, overlap detection, safety checks) but skip file write
- [x] 1.3 Return `valid: true/false` with per-operation diagnostics in dry-run response (mirrors real apply diagnostics)
- [x] 1.4 Include `validated_at_file_version` in dry-run response (not `file_version`, not `snapshot_id`, not `syntax_check`)
- [x] 1.5 Return `invalidation_scope` and `auto_corrections` in dry-run response (same as real apply)
- [x] 1.6 Reject dry-run with empty operations array
- [x] 1.7 Validate dry-run uses current file on disk, not stale cache

## 2. Snapshot & Rollback

- [x] 2.1 Create in-memory snapshot store keyed by absolute file path (Map<string, string>)
- [x] 2.2 Capture complete file content snapshot BEFORE applying edits (after validation passes, before first write)
- [x] 2.3 Include `snapshot_id` in successful edit response details
- [x] 2.4 Skip snapshot capture on rejected edits and dry-run calls
- [x] 2.5 Overwrite existing snapshot when editing same file again (one-deep per file)
- [x] 2.6 Register new `edit_undo` tool with `path` parameter in tool registry
- [x] 2.7 Implement `edit_undo`: restore file from snapshot, write to disk, clear snapshot, return new `file_version`
- [x] 2.8 Return error when `edit_undo` called on path with no stored snapshot
- [x] 2.9 Return diff with new anchor hashes in `edit_undo` response (matching edit tool diff format)
- [x] 2.10 Include stale-anchor warning in `edit_undo` response

## 3. Post-Edit Syntax Validation

- [x] 3.1 Create syntax validation utility module supporting `.js`, `.ts`, `.jsx`, `.tsx`, `.css`, `.html`, `.json`
- [x] 3.2 Implement JS/JSX validation using `esbuild.transformSync` with js/jsx loader; TS/TSX validation using `ts.createSourceFile`
- [x] 3.3 Implement JSON validation using `JSON.parse`
- [x] 3.4 Implement CSS validation using `esbuild.transformSync` with css loader
- [x] 3.5 Implement HTML validation (structural tag balance, exclude void elements)
- [x] 3.6 Integrate syntax check into edit tool: run after successful file write, include `syntax_check` in response
- [x] 3.7 Ensure syntax check is non-blocking — file write is not rolled back on validation failure
- [x] 3.8 Skip syntax check for non-code file extensions (`.md`, `.txt`, `.yaml`, etc.)
- [x] 3.9 Handle parser timeout gracefully — return `{ valid: null, error: "timeout" }` (for CSS/HTML only; esbuild/ts are fast enough to skip timeout)

## 4. Safety Check Dry-Run Integration

- [x] 4.1 Run safety check as part of dry-run validation pipeline (not just on real apply)
- [x] 4.2 In dry-run with `safety_check: "strict"`, return diagnostics as validation failure (`valid: false`) instead of rejection+rollback
- [x] 4.3 In dry-run with `safety_check: "warn"`, return diagnostics as warnings with `valid: true`
- [x] 4.4 In dry-run with `safety_check: "off"`, skip safety checks entirely
- [x] 4.5 Ensure per-operation diagnostic entries are identical between dry-run and real apply for same operations

## 5. Testing & Validation

- [x] 5.1 Unit tests: dry-run validates without writing (all error types: stale anchor, ambiguous, safety failure)
- [x] 5.2 Unit tests: dry-run returns correct diagnostics (invalidation scope, auto-corrections)
- [x] 5.3 Unit tests: snapshot captured on success, skipped on reject and dry-run
- [x] 5.4 Unit tests: edit_undo restores file correctly, clears snapshot
- [x] 5.5 Unit tests: edit_undo error on missing snapshot
- [x] 5.6 Unit tests: syntax validation for each supported file type (valid and invalid cases)
- [x] 5.7 Unit tests: syntax check is non-blocking (edit succeeds despite syntax failure)
- [x] 5.8 Integration test: full dry-run → apply → undo cycle
