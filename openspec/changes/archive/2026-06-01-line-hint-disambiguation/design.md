## Design

### Resolution Ladder (updated)

```
1. 6-char display hash → unique → resolve
2. 8-char resolution hash → unique → resolve
3. occurrence field → pick Nth match → resolve
4. line field (NEW) → pick closest candidate → resolve
5. context-augmented → unique → resolve
6. error: anchor_context_ambiguous
```

### Line Hint Logic in `resolveAnchor`

```
resolveAnchor(displayHash, ctx, occurrence?, line?):
  resHashes = ctx.displayIndex.get(displayHash)
  
  if resHashes.length === 0 → anchor_stale
  if resHashes.length === 1 → resolve single (occurrence/line ignored)
  
  if occurrence provided → resolve by occurrence
  
  // NEW: line hint
  if line provided:
    allCandidates = collect all line numbers from all resHashes, sorted
    if allCandidates.length === 1 → resolve to that one
    else → find candidate closest to |candidate - line|
           if unique closest exists → resolve to it
           else → fall through to error
  
  error: anchor_prefix_ambiguous
```

### Schema Changes

Each single-line operation type gets an optional `line` field:

```typescript
const ReplaceLineOp = Type.Object({
  op: Type.Literal("replace_line"),
  hash: Type.String(),
  content: Type.String(),
  occurrence: Type.Optional(Type.Number()),
  line: Type.Optional(Type.Number({ 
    description: "Advisory line number from read_file snapshot. When hash is ambiguous, selects the candidate closest to this line." 
  })),
});
```

Same for `insert_after`, `insert_before`, `delete_line`.

### Decisions

- `line` is advisory only — hash is still the primary guard. If no candidate is near the line hint, resolution still fails
- `line` comes after `occurrence` in the ladder — explicit beats implicit
- When two candidates are equidistant from `line`, don't guess — fall through to error
- Range operations don't get `line` — proximity-based resolution (`tryProximityResolve`) already covers them
