## Context

The dscode edit tool uses a hash-anchor protocol: `read_file(hashes: true)` returns content-addressed line identities, and `edit` operations target lines by hash rather than line number. The tool already has robust validation — safety checks for brace/paren balance (`edit-diagnostic-enhancement`), anchor disambiguation (`disambiguation-protocol`), low-entropy anchor rejection (`anchor-entropy-filter`), and invalidation contracts (`invalidation-contract`).

However, all validation happens at apply-time. The agent constructs an edit call, submits it, and only then discovers whether it will succeed or corrupt the file. In eval 00MQC73N, this caused ~200 messages of trial-and-error: the agent repeatedly hit `anchor_context_ambiguous`, `safety_check_failed`, and corrupted file states (duplicate code blocks, missing elements) with no recovery mechanism.

The current system gives the agent zero visibility into whether an edit will succeed before committing it — and zero ability to undo when it goes wrong.

## Goals / Non-Goals

**Goals:**
- Let the agent validate an edit batch before applying it (dry-run)
- Provide a one-level undo mechanism for recovery from corrupted edits
- Automatically syntax-check edited JS/TS/CSS/HTML/JSON files after apply
- Give the agent explicit, high-quality anchor recommendations from `read_file`
- Zero breaking changes to existing edit behavior

**Non-Goals:**
- Full git-style versioning or multi-level undo history
- Deep semantic analysis of edited code (type-checking, linting)
- Changing the hash-anchor protocol or operation semantics
- Blocking the agent from making "bad" edits — only informing and enabling recovery

## Decisions

### 1. Dry-run reuses existing validation, skips write

**Decision**: `dry_run: true` runs the complete edit pipeline — hash resolution, disambiguation, entropy filter, safety checks, overlap detection — through to the point just before file write. It returns the exact same diagnostics a real apply would produce (including per-operation safety report, auto-corrections, invalidation scope), but does not write to disk.

**Rationale**: This guarantees dry-run results are identical to what a real apply would produce. No divergence between validation and execution paths.

**Alternative considered**: Separate `edit_validate` tool. Rejected — adds cognitive overhead (yet another tool name), and parameterizing the existing tool is simpler for the agent.

### 2. Snapshot is file-level, one-deep, automatic

**Decision**: Before applying any edit batch, the edit tool saves a complete copy of the file to an in-memory snapshot store keyed by file path. A new `edit_undo` tool (no parameters beyond `path`) restores the file from the last snapshot and clears it. Only the most recent snapshot is kept per file — calling `edit` again overwrites the previous snapshot.

**Rationale**: 
- File-level snapshots are simple and safe (no partial-restore edge cases)
- One-level undo matches the actual failure pattern: agent applies edit → result is wrong → undo → try again
- Automatic capture means the agent doesn't need to remember to snapshot
- In-memory storage avoids filesystem clutter

**Alternative considered**: Region-level snapshot (save only affected lines). Rejected — region-level restore interacts poorly with overlapping edit batches and line count changes.

**Alternative considered**: Multi-level undo stack. Rejected — adds complexity without evidence from eval data that agents need more than one undo level per edit cycle.

### 3. Post-edit validation is best-effort, non-blocking

**Decision**: After successful edit application, for files with extensions `.js`, `.ts`, `.jsx`, `.tsx`, `.css`, `.html`, `.json`, run a lightweight syntax check. For JS-family: use Node.js `vm.Script` constructor (synchronous, no execution). For JSON: `JSON.parse`. For CSS: regex-based brace/rule validation. For HTML: basic tag-balance check. Results are included in the edit response as `syntax_check: { valid: boolean, errors?: [{line, message}] }`. The edit is NOT rolled back if syntax check fails — it's informational only.

**Rationale**: 
- Catches the "Unexpected token ':'" class of errors before the agent spends turns on browser testing
- Non-blocking because the agent may intentionally write intermediate-state code
- `vm.Script` is available in Node.js without dependencies, parses without executing

**Alternative considered**: Full TypeScript compiler API. Rejected — too slow, too heavy, requires tsconfig resolution.

**Alternative considered**: Making syntax errors block the edit. Rejected — the agent sometimes needs to write partial code as an intermediate step.

### 4. Recommended anchors are computed from quality + distribution

**Decision**: `read_file(hashes: true)` already classifies lines as `low`/`medium`/`high` quality. Extend the output with `recommended_anchors: [{line, hash, snippet}]` — selecting up to 5 high-quality lines that are well-distributed across the file (avoiding clustering). Selection algorithm: take all `high` lines, sort by position, pick the first, last, and 3 evenly-spaced lines in between. If fewer than 5 `high` lines exist, supplement with `medium` lines.

**Rationale**: 
- Distribution matters because the agent needs anchors near the region it wants to edit
- Explicit recommendations eliminate the agent's need to visually scan and guess which lines are safe
- Reuses existing quality classification — no new computation needed

**Alternative considered**: Return ALL high-quality lines. Rejected — too much output for large files, dilutes the signal.

## Risks / Trade-offs

- **[Risk] Snapshot memory growth**: Large files (100KB+) stored in memory could accumulate. → **Mitigation**: Single snapshot per file path; overwrite on next edit. Worst case: one copy of the largest edited file (~few MB). Also, snapshots are cleared on `edit_undo` or when the session ends.
- **[Risk] `vm.Script` timeout on malformed code**: Extremely large or pathological JS could hang the parser. → **Mitigation**: Set a 1-second timeout on `vm.Script` construction via worker thread or `execSync`-style wrapper. On timeout, return `syntax_check: { valid: null, error: "timeout" }`.
- **[Risk] Dry-run may produce different results than apply if file changes between calls**: The agent could dry-run, then the file could be modified externally before apply. → **Mitigation**: Include the snapshot file version in the dry-run response. On real apply, if file version differs, reject with a clear message: "File modified since dry-run. Re-run dry-run to validate."
- **[Risk] Agent may ignore dry-run and continue blind**: The feature is opt-in. → **Mitigation**: System prompt guidance (separate from this change) should recommend: "Before editing a file for the first time in a turn, dry-run your edit batch. Remove `dry_run: true` to apply." Not enforced — the tool can't force the agent to use it, but even 50% adoption would significantly reduce the 15.3% error rate seen in 00MQC73N.

## Open Questions

- Should `edit_undo` require user confirmation (permission prompt) or be silent? Silent matches the current edit tool's behavior (no confirmation for file modifications).
- Should dry-run be the default behavior, requiring `confirm: true` to actually apply? This would maximize adoption but changes the current API contract. Leaning toward opt-in for now to avoid breaking changes.
