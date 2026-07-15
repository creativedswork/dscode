## Why

The OPSX workflow has a gap: explore mode can skip directly to apply, bypassing propose. The prototype artifact is marked "optional, does not block apply" in the schema, so even when a prototype HTML is created during explore, nothing enforces carrying its decisions into the change artifacts. We need a hard gate: explore → propose → apply (unconditional), with the schema enforcing prototype as a dependency of tasks.

## What Changes

- **Schema hard gate**: `prototype` artifact changes from optional to mandatory; `tasks.requires` adds `prototype` as a dependency, so the CLI blocks task creation until prototype exists
- **Prototype artifact semantics**: For UI changes, prototype.md references HTML files from `docs/prototypes/` and captures design decisions. For non-UI changes, prototype.md is a 2-line stub ("No prototype needed — reason")
- **Unconditional explore → propose flow**: explore command's "Ending Discovery" section always directs to `/opsx:propose`, never `/opsx:apply`
- **Propose prototype awareness**: propose command adds a step 0 to check `docs/prototypes/` for HTML files from explore and incorporate them into the prototype artifact
- **Config alignment**: `openspec/config.yaml` removes "Prototype does NOT block apply" and reflects the new mandatory status
- **Skill updates**: prototype-workflow and openspec-explore skills align to the new flow

## Capabilities

### New Capabilities
_None._

### Modified Capabilities
- `explore-prototype-workflow`: Add requirements for the schema-level prototype gate (tasks depends on prototype), the unconditional explore → propose flow, and the propose command's prototype-awareness step

## Impact

- `openspec/schemas/spec-driven-plus/schema.yaml` — prototype.requires, tasks.requires, prototype description + instruction
- `openspec/schemas/spec-driven-plus/templates/prototype.md` — rewrite as prototype manifest with HTML references + non-UI stub
- `openspec/config.yaml` — remove "does not block apply", update prototype description
- `.dscode/commands/opsx/explore.md` + `.clinerules/workflows/opsx-explore.md` + `.claude/commands/opsx/explore.md` — Ending Discovery section
- `.dscode/commands/opsx/propose.md` + `.clinerules/workflows/opsx-propose.md` + `.claude/commands/opsx/propose.md` — add prototype check step
- `.dscode/skills/prototype-workflow/SKILL.md` — step 6 redirect to /opsx:propose
- `.dscode/skills/openspec-explore/SKILL.md` — ending section
- `.dscode/skills/openspec-propose/SKILL.md` — add prototype awareness
- Existing in-flight changes with `tasks` created but no `prototype` artifact will need a retroactive prototype.md stub
