## MODIFIED Requirements

### Requirement: Batched single-line operations apply position-independently

`applyEditOperations` SHALL apply single-line operations (`replace_line`, `insert_after`, `insert_before`, `delete_line`) within one batch in a way that is invariant to their order in the `operations` array. Operations targeting **different** anchor lines SHALL NOT be corrupted by line-index drift from earlier insertions/deletions in the same batch.

The tool SHALL sort single-line operations by their resolved anchor line number in **descending** order (bottom-up) before applying, so each operation's anchor index remains valid at the moment it is applied. This ordering SHALL be applied internally regardless of the order the model supplies.

#### Scenario: adjacent-line insert_after then replace_line
- **WHEN** a batch contains `insert_after` on line 234 AND `replace_line` on line 235
- **THEN** the resulting file SHALL contain exactly one inserted line AND the replaced line at the correct positions
- **AND** no line SHALL be duplicated, lost, or overwritten by a misplaced index

#### Scenario: order independence for distinct anchors
- **WHEN** the same set of single-line operations targeting distinct lines is supplied in any order
- **THEN** the resulting file content SHALL be identical regardless of operation order

#### Scenario: insert_before then replace_line on the following line
- **WHEN** a batch contains `insert_before` on line 30 AND `replace_line` on line 29
- **THEN** the insert SHALL land before line 30 AND the replace SHALL land on line 29 without either corrupting the other

### Requirement: Mixed single-line and range operations apply bottom-up

When a batch mixes single-line operations with `replace_range` / `delete_range`, the tool SHALL sort **all** operations by their effective anchor line number (for range ops, the larger of the two endpoint line numbers) in descending order before applying. This SHALL keep range replacements immune to index drift from operations below them.

#### Scenario: range replace plus insert below it
- **WHEN** a batch contains `replace_range` spanning lines 10–12 AND `insert_after` on line 15
- **THEN** both operations SHALL apply to their intended lines without drift

### Requirement: Same-hash operation merge is preserved

The existing same-hash merge in `detectAndResolveOverlaps` (`replace_line` + `insert_after`, `insert_before` + `replace_line`, and the `overlapping_operations` conflicts) SHALL continue to run **before** the bottom-up sort. Bottom-up sorting SHALL NOT reorder or break already-merged same-hash operations.

#### Scenario: same-hash merge still applies before sort
- **WHEN** a batch contains `replace_line` and `insert_after` on the same hash
- **THEN** they SHALL be merged into a single `replace_line` first, and the merged operation SHALL participate in bottom-up sorting as one unit
