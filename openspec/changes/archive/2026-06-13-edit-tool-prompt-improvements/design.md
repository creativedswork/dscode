## Context

The `edit` tool uses content-addressable hashes as anchors for file modifications. Data from 15 real-world sessions shows three failure modes:

1. **Cross-version conflicts (40.8%)**: The model reads anchors, performs other operations, then calls `edit` — by which time the file has changed (often from a prior `write_file` or `edit` call in the same turn). The tool correctly rejects these stale anchors, but the guidance doesn't steer the model away from the pattern that causes them.
2. **Repetitive-line ambiguity (3 warnings)**: HTML/CSS/JS files contain many identical lines (`}`, empty lines, `display: flex;`). The model anchors on these, triggering low-entropy rejection or ambiguity errors.
3. **Parameter schema drift (2 hard errors)**: The model uses deprecated `file_path` instead of `path`, or passes `start_hash` to `replace_line`.

All three are guidance problems, not tool-mechanism problems. The tool's rejection behavior is correct; the system prompt just doesn't steer the model toward high-success patterns.

## Goals / Non-Goals

**Goals:**
- Reduce cross-version conflict rate from 40.8% to <15% through anchor-freshness and multi-file-ordering guidance
- Eliminate repetitive-line ambiguity warnings through anchor-selection strategy
- Eliminate parameter validation errors through anti-footgun documentation
- Keep all changes additive — no existing guidance is removed

**Non-Goals:**
- Change the edit tool's runtime behavior, schema, or error taxonomy
- Add new tool capabilities (e.g., automatic anchor refresh)
- Change the `edit-diagnostic-enhancement` spec (separate concern)
- Remove or rewrite any existing system-prompt content outside the edit tool section

## Decisions

### Decision 1: Add guidance to the system prompt, not the tool runtime

The tool already has correct rejection behavior for stale anchors, low-entropy targets, and ambiguous hashes. Adding guidance to the system prompt is lower-risk and faster to iterate than adding runtime heuristics (e.g., auto-rereading files). If the guidance is insufficient, runtime improvements can follow in a separate change.

**Alternatives considered:**
- *Auto-reread on stale anchor*: Would mask the root cause and add latency. Rejected.
- *Warn on stale anchor without rejecting*: Would produce silent corruption. Rejected.

### Decision 2: Anchor-freshness guidance sits in the edit tool description, not Tool Use Rules

The freshness constraint is specific to the edit tool's hash-anchor protocol. Placing it in the edit tool description keeps it co-located with the mechanism it governs. The multi-file order guidance (which also affects `read_file` and `write_file`) goes in Tool Use Rules.

**Alternatives considered:**
- *All in Tool Use Rules*: Would create distance between the edit tool's mechanism and its usage constraint, making it easier to miss.
- *All in edit tool description*: The multi-file ordering is broader than edit and belongs with other cross-tool sequencing rules.

### Decision 3: Operation-selection matrix as a table, not prose

A table format is scannable and reduces cognitive load when the model is choosing between operations. Prose descriptions were tried in early drafts and produced the same misuse patterns the data shows.

**Alternatives considered:**
- *Prose guidelines*: Same content, harder to reference quickly during generation.
- *Decision tree*: Too verbose for a system prompt context window.

## Risks / Trade-offs

- **Risk**: Added prompt text increases token consumption on every turn. → **Mitigation**: The additions total ~300 words, negligible relative to the full system prompt.
- **Risk**: Overly prescriptive anchor-selection rules cause the model to avoid `replace_line` entirely in favor of `replace_range`. → **Mitigation**: The matrix includes clear criteria for when each operation is appropriate. Monitor the operation-type distribution after deployment.
- **Risk**: "Same or immediate next turn" constraint may cause awkward interaction patterns where the model re-reads files unnecessarily. → **Mitigation**: The guidance says "or the immediate next turn" — it doesn't force re-reading if the anchors are fresh. The model can batch a read+edit in one turn.
