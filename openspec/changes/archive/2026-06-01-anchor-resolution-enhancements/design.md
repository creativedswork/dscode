## Design

### 1. Low-Entropy Tolerance

**Before**: Any single-line op targeting low-entropy line → `anchor_low_entropy` reject.
**After**: Only reject if the hash matches multiple candidates AND no `occurrence` is provided.

```
quality === "low" + hash 唯一                        → ✅ allow
quality === "low" + hash 歧义 + occurrence 指定      → ✅ allow
quality === "low" + hash 歧义 + 无 occurrence        → ❌ reject
```

Implementation: count total candidates via `ctx.displayIndex` + `ctx.resolutionMap`. Only push to `lowEntropyAnchors` when `totalCandidates > 1 && occurrence === undefined`.

### 2. Numbered Occurrence in Ambiguity Errors

**Before**: `hash "505b97" matches:\n  line 35: "    return;"\n  line 123: "    return;"...`
**After**: `hash "505b97" matches (use occurrence to select):\n  #1 line 35: "    return;"\n  #2 line 123: "    return;"...`

Agent can retry with `occurrence: 2` to target line 123.

### 3. Proximity-Based Range Resolution

When a range op has one unique endpoint and one ambiguous endpoint, automatically resolve the ambiguous one to the closest candidate in the correct direction.

```
start=unique(line 182), end=ambiguous(`}` at [35, 57, 100, 185, 200, ...])
→ find first `}` ≥ line 182 → line 185
→ resolve end to line 185, remove from ambiguousAnchors

start=ambiguous(`{` at [10, 50, 90]), end=unique(line 100)
→ find last `{` ≤ line 100 → line 90
→ resolve start to line 90
```

### 4. Sanity Check Precision

**Before**: Scan `[affectedMinLine - 4, affectedMaxLine + 4]` context window. Positional comparison `oldLines[i] !== newLines[i]` marks shifted lines as "changed".

**After**:
- **Duplicate line**: Only flag lines whose hash does NOT exist in `oldLines` (genuinely new content)
- **Delimiter balance**: Compare whole-file old/new totals → net delta (immune to position shifts)
- **Orphan fragment**: Only check genuinely new lines (`!oldHashSet.has(h)`)

## Decisions

- Proximity resolution is transparent (no agent involvement needed) — keeps protocol simple
- Proximity resolution only fires when exactly one endpoint is ambiguous — two ambiguous endpoints still reject
- `computeLineHash` uses `line.trim()` — same as display hash, ensuring `oldHashSet` consistency
