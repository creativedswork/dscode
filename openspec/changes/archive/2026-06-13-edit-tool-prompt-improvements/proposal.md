## Why

Data from 15 sessions (125 edit calls, 261 operations) reveals systemic friction in the edit tool: 40.8% cross-version conflicts caused by stale anchors, 3 repetitive-line ambiguity warnings, and 2 hard parameter-validation errors. These failures waste turns, force fallback to `write_file`, and degrade the agent's editing experience. The root cause is not the tool's mechanism but insufficient system-prompt guidance on anchor freshness, anchor selection strategy, operation selection, and multi-file edit ordering.

## What Changes

- **Anchor freshness rule**: Explicitly require edits to follow reads in the same or immediate next turn, preventing stale anchors from causing cross-version conflicts.
- **Anchor selection guidance**: Teach the agent to prefer unique-content lines as anchors, avoid repetitive boilerplate (empty lines, `}`, common CSS properties), and use `replace_range` with unique boundary anchors when targeting repetitive regions.
- **Operation selection matrix**: Provide a quick-reference table mapping editing situations to recommended operations, reducing misuse (e.g., `replace_line` on repetitive content).
- **Multi-file editing order**: Enforce a completion pattern (read A → edit A → read B → edit B) instead of interleaved reads and edits across files.
- **Parameter anti-footgun**: Document that `path` replaces the deprecated `file_path`, and that single-anchor ops (`hash`) are distinct from dual-anchor ops (`start_hash` + `end_hash`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `edit-tool`: All five system-prompt changes refine the edit tool's usage guidance — anchor freshness, anchor selection strategy, operation selection matrix, multi-file ordering, and parameter validation rules. These are requirement-level changes to the edit tool's spec because they define new constraints on how the tool is invoked and sequenced.

## Impact

- **System prompt** (`edit` tool description + Tool Use Rules section): The primary change surface. All edits are additive — no existing guidance is removed or contradicted.
- **No API changes, no tool schema changes, no breaking changes**.
