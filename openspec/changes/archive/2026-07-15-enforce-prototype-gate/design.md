## Context

The OPSX workflow has four commands: explore, propose, apply, archive. The `spec-driven-plus` schema defines artifacts: proposal → specs → design → prototype → tasks → consolidate. Currently `prototype` is optional with `requires: []` and `tasks.requires: [specs, design]` — prototype is not in the chain. This allows two failure modes: (1) explore skips directly to apply, and (2) even when propose is used, prototype can be skipped without consequence.

The explore command's "Ending Discovery" section mentions propose as one option among several, and the propose command has no awareness of prototypes created during explore.

## Goals / Non-Goals

**Goals:**
- Enforce explore → propose → apply as the unconditional flow
- Make prototype a schema-level hard gate: `tasks` cannot be created without `prototype`
- For UI changes: prototype.md references HTML files from `docs/prototypes/`
- For non-UI changes: prototype.md is a trivial stub (2 lines)
- Propose command reads prototypes from explore and incorporates them

**Non-Goals:**
- Changing the openspec CLI engine itself (we only modify the project-level schema.yaml)
- Making prototype conditional in the schema (openspec doesn't support conditional requires — the stub handles non-UI)
- Creating change directories during explore (explore only thinks + prototypes)

## Decisions

### D1: `prototype.requires: [design]` (not `[proposal]`)

Prototype should come after design because the prototype artifact references design decisions. Order: proposal → specs → design → prototype → tasks.

**Alternative considered**: `prototype.requires: [proposal]` — rejected because prototype needs design context to be meaningful for UI changes.

### D2: `tasks.requires: [specs, design, prototype]`

Adding prototype to tasks' dependency list. This is the hard gate — the CLI itself blocks task creation.

### D3: Non-UI stub instead of conditional schema

Openspec's schema system uses static `requires` lists with no conditional logic. Rather than keeping prototype optional and relying on command-level enforcement (weak), we make it mandatory for ALL changes. Non-UI changes get a 2-line stub prototype.md. The value is not the stub content — it's forcing the question "is this a UI change?"

### D4: Prototype template restructure

The current prototype.md template is a generic visual direction doc (color palette, wireframe, interaction flow). It should become a **prototype manifest**:

- For UI: lists HTML file paths from `docs/prototypes/`, summarizes decisions from visual iteration
- For non-UI: "No prototype needed" + reason

### D5: Three-location sync for commands

Commands exist in `.dscode/commands/opsx/`, `.clinerules/workflows/`, and `.claude/commands/`. All three must be updated identically, with `.dscode/` as the canonical source.

### D6: Explore ending — hard redirect to propose

The "Ending Discovery" section currently lists propose as one option. Change it to: explore ALWAYS ends with "run /opsx:propose next." Remove any mention of /opsx:apply from explore's ending section.

## Risks / Trade-offs

- **Risk**: Existing in-flight changes (e.g., `fix-tool-result-rendering`, `subagent-design-proposal`) already have tasks but no prototype. After schema change, `openspec status` may show them as inconsistent.
  - **Mitigation**: Add retroactive prototype.md stubs to in-flight changes as part of implementation.

- **Risk**: Non-UI stub feels like ceremony for no value.
  - **Trade-off**: The 2-line stub is the cost of a hard gate. The alternative (command-level enforcement) is weaker and can be bypassed. Accept the ceremony.

- **Risk**: Explore creates HTML prototypes in `docs/prototypes/` before a change directory exists. The propose command needs to match prototype files to the change name.
  - **Mitigation**: Propose step 0 checks `docs/prototypes/` for files matching `<change-name>-*.html`. Naming convention already established by prototype-workflow skill.
