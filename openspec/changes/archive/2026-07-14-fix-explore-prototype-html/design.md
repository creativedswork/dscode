## Context

The `spec-driven-plus` schema defines a `prototype` artifact for frontend/UI exploration. However, the current implementation has three problems:

1. **Wrong format**: The explore command and System Prompt describe the prototype output as `prototype.md`, but the proven workflow (session 00MRIZMZQJ) uses self-contained HTML files.
2. **Broken CLI reference**: `openspec instructions prototype` is referenced but the CLI doesn't support `prototype` as a valid artifact (only `proposal`, `specs`, `design`, `tasks`).
3. **No output convention**: HTML prototypes were placed ad-hoc at the project root. A canonical directory and constraint file are needed.

## Goals / Non-Goals

**Goals:**
- Fix explore command (`.claude/commands/opsx/explore.md` + `.clinerules/workflows/opsx-explore.md`) to describe HTML-first prototyping
- Fix System Prompt (AGENTS.md) prototype section
- Establish `docs/prototypes/` as the canonical output directory
- Create `docs/prototypes/prototype.md` as a constraint file for HTML prototype generation
- Move existing `mcp-toolcard-execution-view-prototype.html` from root into `docs/prototypes/`
- Update `openspec/config.yaml` prototype artifact description

**Non-Goals:**
- NOT implementing `openspec instructions prototype` CLI support (that's a separate change)
- NOT changing the schema definition of the `prototype` artifact in this change's own artifact system
- NOT modifying any existing HTML prototype content — only moving and creating convention files

## Decisions

### D1: Output directory → `docs/prototypes/`

**Choice**: `docs/prototypes/` rather than `web/prototypes/` or project root.

**Rationale**:
- `web/prototypes/` exists but sits inside a source directory — prototypes are design artifacts, not source code
- `docs/` already houses project documentation (`docs/STYLE.md`); prototypes are a form of visual documentation
- Project root clutters the top level and mixes design exploration with config files
- `web/prototypes/` remains as legacy; no migration needed since it's empty

**Alternatives considered**:
- `openspec/prototypes/`: Too deep; prototypes should be browsable without navigating OpenSpec internals
- Project root: Proven messy by session 00MRIZMZQJ

### D2: Constraint file as `prototype.md` in the output directory

**Choice**: Place `docs/prototypes/prototype.md` in the same directory as the HTML prototypes it governs.

**Rationale**:
- Co-location: anyone browsing prototypes sees the constraint file immediately
- The `prototype.md` acts as a README + style guide for the directory
- This mirrors a common pattern: `docs/prototypes/README.md` with conventions

### D3: Explore command prototype section placement

**Choice**: Add the prototype flow as a subsection under "What You Might Do" in the explore command file, and mirror in the System Prompt.

**Rationale**:
- The explore command is where the detection and triggering logic lives most naturally
- The System Prompt needs it too for base-level awareness
- Keeping both in sync is explicit (two files to edit) rather than implicit (one references the other)

### D4: Naming convention

**Choice**: `<change-name>-<descriptor>.html`

**Rationale**:
- Traceable back to the change that spawned it
- `<descriptor>` allows multiple prototypes per change (e.g., `mcp-progress-waiting-state.html`, `mcp-progress-done-state.html`)
- No date prefix — git tracks chronology

## Risks / Trade-offs

- **[Risk] Two `prototype.md` files with different meanings**: One in `openspec/changes/<name>/prototype.md` (OpenSpec artifact describing the prototype design), one in `docs/prototypes/prototype.md` (constraint file for HTML generation). → **Mitigation**: Name collision is acceptable — they live in completely different directory trees and contexts. The OpenSpec one is per-change design thinking; the docs one is a standing convention.

- **[Risk] Explore command file duplication**: `.claude/commands/opsx/explore.md` and `.clinerules/workflows/opsx-explore.md` must stay in sync. → **Mitigation**: Both are edited in the same change. A comment in each file references the other.

## Open Questions

_None._ All decisions resolved in explore discussion.
