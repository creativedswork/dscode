## 1. Locate system prompt source files

- [x] 1.1 Identify the file(s) where the edit tool description is assembled (the text injected into the system prompt under the edit tool section)
- [x] 1.2 Identify the file(s) where the Tool Use Rules section is assembled
- [x] 1.3 Confirm the edit tool description and Tool Use Rules sections in the assembled system prompt output

## 2. Anchor freshness guidance (Change 1)

- [x] 2.1 Add anchor-freshness paragraph to the edit tool description, immediately after the `First read the file...` instruction: "After reading a file with `read_file(hashes: true)`, apply edits to that file in the same response turn or the immediate next turn. Do not read file A, then read file B, then later edit file A — the anchors from A will be stale and cause cross-version conflicts. Process one file completely (read → edit) before reading anchors for another file."

## 3. Anchor selection guidance (Change 2)

- [x] 3.1 Add anchor-selection paragraph to the edit tool description, after the `For duplicate-content lines...` section: "Anchor selection guidance: Prefer lines with unique, distinctive content as anchors. Avoid anchoring on empty lines, closing braces (`}`), or frequently repeated boilerplate (e.g., `position: fixed;`, `display: flex;` in CSS, `</div>` in HTML). For files with repetitive content, use `replace_range` with two unique boundary anchors instead of `replace_line` — range operations enforce uniqueness on both endpoints and are rejected if ambiguous. When a `replace_line` anchor matches multiple lines, use the `occurrence` field (1-indexed) and `line` field (advisory line number) together to disambiguate."

## 4. Operation-selection matrix (Change 3)

- [x] 4.1 Add operation-selection matrix table to the Tool Use Rules section or edit tool description end:

| Situation | Recommended Operation |
|-----------|----------------------|
| Change a single line with unique content | `replace_line` |
| Change a contiguous block of lines | `replace_range` |
| Insert new content between two existing lines | `insert_after` / `insert_before` |
| Remove a single unique line | `delete_line` |
| Remove a contiguous block of lines | `delete_range` |
| Target line is repetitive (empty line, `}`, boilerplate) | `replace_range` wrapping it with unique neighbor anchors |

## 5. Multi-file editing order (Change 4)

- [x] 5.1 Add multi-file editing guidance to the Tool Use Rules section: "Multi-file editing: When modifying multiple files, complete all operations on one file before moving to the next. Batch operations targeting the same file into a single `edit` call where possible (all operations in one call are atomic against the same snapshot). Avoid interleaving reads and edits across different files — read A → edit A → read B → edit B, not read A → read B → edit A → edit B."

## 6. Parameter anti-footgun (Change 5)

- [x] 6.1 Add parameter notes to the edit tool description end:

"Parameter notes:
- Use `path` to specify the file; `file_path` is deprecated and will be rejected.
- `replace_line` / `delete_line` / `insert_after` / `insert_before` use `hash` (single anchor).
- `replace_range` / `delete_range` use `start_hash` + `end_hash` (two anchors).
- Mixing these (e.g., `start_hash` on a `replace_line`) causes validation failure."

## 7. Validation

- [x] 7.1 Run `npm run typecheck` to verify no TypeScript breakage
- [x] 7.2 Run `npm test` to verify no regression in existing edit tool tests
- [x] 7.3 Spot-check system prompt output to confirm all 5 guidance sections appear in their intended locations