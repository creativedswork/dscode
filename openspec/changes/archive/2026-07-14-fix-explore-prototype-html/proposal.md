## Why

The explore command's prototype flow is broken: it references `prototype.md` as the output format and `openspec instructions prototype` as the generation command — neither of which reflects reality. The actual workflow (exemplified by session 00MRIZMZQJ) is "HTML prototype first, iterate visually, then implement." The tooling, conventions, and documentation need to align with this proven workflow.

## What Changes

- Fix explore command (`.claude/commands/opsx/explore.md` + `.clinerules/workflows/opsx-explore.md`) to describe HTML-first prototyping instead of markdown prototypes
- Fix System Prompt (AGENTS.md) prototype section to match
- Establish `docs/prototypes/` as the canonical output directory for prototype HTML files
- Create `docs/prototypes/prototype.md` as a constraint file specifying: output directory, naming convention, style alignment rules, and required skill (`html-output`)
- Move existing `mcp-toolcard-execution-view-prototype.html` from project root into `docs/prototypes/`
- Update `openspec/config.yaml` prototype artifact description to align with the new HTML workflow

## Capabilities

### New Capabilities
- `explore-prototype-workflow`: Defines the HTML-first prototype generation flow triggered from explore mode — including detection keywords, generation steps (load html-output skill → extract CSS tokens → produce self-contained HTML → iterate → capture), output directory convention (`docs/prototypes/`), naming convention (`<change-name>-<descriptor>.html`), and lifecycle (retained for future reference)

### Modified Capabilities
_None._ This change is about tooling/workflow conventions, not product spec behavior.

## Impact

- `.claude/commands/opsx/explore.md` — add prototype section
- `.clinerules/workflows/opsx-explore.md` — add prototype section (mirror)
- System Prompt / AGENTS.md — replace old `prototype.md` paragraph
- `openspec/config.yaml` — update prototype artifact description
- `docs/prototypes/prototype.md` — new constraint file
- `docs/prototypes/mcp-toolcard-execution-view-prototype.html` — moved from root
