## Purpose

Defines the mandatory HTML-first prototype workflow for UI changes — including
output directory conventions, naming rules, constraint files, skill loading,
artifact gating, post-implementation retention, archive handling, and canonical
command/skill distribution.
## Requirements
### Requirement: HTML prototype output directory
HTML prototypes generated during explore mode SHALL be placed in `docs/prototypes/` with the naming convention `<change-name>-<descriptor>.html`.

#### Scenario: Prototype generated during explore
- **WHEN** an explore session triggers HTML prototype generation for change `mcp-tool-progress`
- **THEN** the output file is `docs/prototypes/mcp-tool-progress-<descriptor>.html`

#### Scenario: Multiple prototypes for same change
- **WHEN** the same change requires multiple prototypes (e.g., different states)
- **THEN** each prototype uses a distinct descriptor (e.g., `waiting-state.html`, `done-state.html`)

### Requirement: Prototype constraint file
`docs/prototypes/README.md` SHALL exist as the standing constraint file specifying the conventions for HTML prototype generation.

#### Scenario: Constraint file content
- **WHEN** the constraint file is read
- **THEN** it specifies at minimum: staging directory (`docs/prototypes/`), file format (self-contained HTML), naming convention, style alignment rules (read `web/index.css` `--color-*` variables), required skill (`html-output`), and apply/archive lifecycle

#### Scenario: Constraint file is read before generation
- **WHEN** an agent is about to generate an HTML prototype
- **THEN** it reads `docs/prototypes/README.md` first to obtain constraints

### Requirement: Explore command prototype section
The explore command file (`.dscode/commands/opsx/explore.md`, `.clinerules/workflows/opsx-explore.md`, and `.claude/commands/opsx/explore.md`) SHALL contain a "Create HTML prototypes for frontend ideas" section under "What You Might Do" AND an "Ending Discovery" section that unconditionally directs to `/opsx:propose`.

#### Scenario: Detection keywords
- **WHEN** an explore discussion mentions UI, 页面, 界面, 组件, 交互, 样式, 视觉, CSS, frontend, landing, dashboard, 原型, prototype, redesign, or 动效
- **THEN** the agent SHALL identify the change as requiring an HTML prototype

#### Scenario: Generation steps
- **WHEN** a UI change is being prepared for proposal
- **THEN** the agent SHALL: (1) read `docs/prototypes/README.md`, (2) load `prototype-workflow` and `html-output`, (3) extract `--color-*` variables from `web/src/index.css`, (4) generate self-contained HTML at `docs/prototypes/<name>-<descriptor>.html`

#### Scenario: Visual iteration
- **WHEN** a prototype is generated
- **THEN** the agent SHALL accept visual feedback and iterate on the HTML prototype before capturing final design decisions

#### Scenario: Ending discovery unconditionally goes to propose
- **WHEN** explore for a UI change is ready to proceed
- **THEN** the agent SHALL ensure an HTML prototype exists before directing the user to `/opsx:propose`
- **AND** the agent SHALL NOT suggest `/opsx:apply`

### Requirement: System Prompt prototype alignment
The System Prompt (AGENTS.md) SHALL describe the HTML prototype workflow consistently with the explore command.

#### Scenario: No markdown prototype reference
- **WHEN** the System Prompt mentions frontend prototyping
- **THEN** it SHALL reference HTML prototypes and `docs/prototypes/`, NOT `prototype.md` as the output format

#### Scenario: Session reference
- **WHEN** the System Prompt describes the prototype workflow
- **THEN** it SHALL reference session 00MRIZMZQJ as a canonical example

#### Scenario: Lifecycle alignment
- **WHEN** the System Prompt describes `docs/prototypes/`
- **THEN** it SHALL identify the root as staging and direct apply/archive to the `prototype-workflow` retention policy

### Requirement: Prototype staging lifecycle

`docs/prototypes/` SHALL be a temporary explore/propose staging directory.
After implementation and validation complete, apply SHALL classify each HTML
prototype as `archive` or `delete` using the `prototype-workflow` long-term
value and validity gates. Uncertain prototypes SHALL default to `delete`.

#### Scenario: Disposable prototype
- **WHEN** a prototype is a one-off bug reproduction, superseded variant, implementation snapshot, or fully represented by code, tests, and specs
- **THEN** apply SHALL mark it `delete`, remove the HTML and README index entry, and eliminate stale references

#### Scenario: Durable prototype
- **WHEN** a current, browser-validated prototype preserves reusable interaction contracts, an otherwise inexpressible state matrix, or executable evidence needed by future design work
- **THEN** apply SHALL mark it `archive` with a concrete rationale

#### Scenario: Archive durable prototype
- **WHEN** an OpenSpec change with an `archive` prototype is archived
- **THEN** archive SHALL move it to `docs/prototypes/archive/YYYY-MM-DD-<change-name>/`
- **AND** update repository references so no staging path remains

#### Scenario: Pending decision blocks completion
- **WHEN** a spec-driven-plus implementation has a missing or `pending` prototype retention decision
- **THEN** apply SHALL NOT report the change ready to archive

### Requirement: OpenSpec config alignment
`openspec/config.yaml` SHALL describe the prototype artifact as mandatory and blocking tasks, consistent with the schema-level gate.

#### Scenario: Config description reflects mandatory prototype
- **WHEN** `openspec/config.yaml` is read
- **THEN** the prototype artifact description SHALL state it is mandatory and blocks `tasks` creation — NOT "optional" or "does not block apply"

#### Scenario: Config references HTML prototypes
- **WHEN** `openspec/config.yaml` describes the prototype workflow
- **THEN** it SHALL reference HTML prototypes, `docs/prototypes/`, and the `html-output` skill — not `prototype.md` as output and not `openspec instructions prototype` as the generation method

### Requirement: Schema-level prototype gate
The `spec-driven-plus` schema SHALL enforce `prototype` as a dependency of `tasks`. The `tasks` artifact's `requires` list SHALL include `prototype`, so the CLI blocks task creation until the prototype artifact exists.

#### Scenario: Tasks blocked without prototype
- **WHEN** a change's `prototype` artifact has not been created
- **THEN** `openspec status` SHALL show `tasks` as `blocked` and `openspec instructions tasks` SHALL refuse to proceed

#### Scenario: Tasks unblocked after prototype
- **WHEN** a change's `prototype` artifact has been created (either UI manifest or non-UI stub)
- **THEN** `tasks` SHALL become `ready` and `openspec instructions tasks` SHALL proceed normally

### Requirement: Prototype artifact requires design
The `prototype` artifact's `requires` list SHALL include `design`, ensuring prototype is created after design decisions are captured.

#### Scenario: Prototype blocked without design
- **WHEN** a change's `design` artifact has not been created
- **THEN** `prototype` SHALL show as `blocked`

### Requirement: Prototype artifact content for UI changes
UI changes SHALL include at least one HTML prototype. For changes involving
visible UI, rendering, layout, CSS, interaction, or user-facing states, the
`prototype.md` artifact SHALL reference at least one
existing self-contained HTML prototype from `docs/prototypes/` and capture key
design decisions refined during visual iteration. A text-only visual direction
MUST NOT satisfy this requirement.

#### Scenario: UI change prototype artifact
- **WHEN** the change involves UI and HTML prototypes exist in `docs/prototypes/`
- **THEN** `prototype.md` SHALL list each prototype file path, summarize the visual direction, and reference the design decisions confirmed during explore
- **AND** initialize one `Prototype Retention` row per file with decision `pending`

#### Scenario: UI change without HTML prototype
- **WHEN** the change involves UI but no matching HTML prototype exists
- **THEN** artifact generation SHALL stop before `prototype.md` is completed
- **AND** the agent SHALL generate and validate an HTML prototype before continuing

### Requirement: Prototype artifact content for non-UI changes
Prototype stubs MUST be limited to changes that have no visible UI, rendering,
layout, CSS, interaction, or user-facing state impact. Such changes MAY use a
`prototype.md` stub stating no prototype is needed with a one-line rationale.

#### Scenario: Non-UI change prototype stub
- **WHEN** the change is backend-only, config, or refactoring with no UI impact
- **THEN** `prototype.md` SHALL contain a "No prototype needed" section with a brief reason (e.g., "backend-only change affecting X module")
- **AND** state that prototype retention is not applicable

### Requirement: Unconditional explore to propose flow
The explore command SHALL always direct the user to `/opsx:propose` as the next step after exploration. The explore command SHALL NEVER suggest `/opsx:apply` directly.

#### Scenario: Explore ending with prototype
- **WHEN** explore completes and an HTML prototype was created in `docs/prototypes/`
- **THEN** the explore command SHALL say to run `/opsx:propose` next, mentioning the prototype will be incorporated

#### Scenario: Explore ending without prototype
- **WHEN** non-UI exploration completes and no prototype was created
- **THEN** the explore command SHALL say to run `/opsx:propose` next

#### Scenario: UI explore cannot finish without prototype
- **WHEN** UI exploration has no HTML prototype
- **THEN** the agent SHALL generate the HTML prototype or pause the workflow
- **AND** it SHALL NOT treat the UI exploration as proposal-ready

### Requirement: Propose command prototype awareness
The propose command SHALL check `docs/prototypes/` for HTML prototype files matching the change name before creating the prototype artifact.

#### Scenario: Propose finds prototype HTML
- **WHEN** propose runs and `docs/prototypes/` contains HTML files matching the change name
- **THEN** propose SHALL read those files and use them as design source-of-truth when creating the prototype artifact

#### Scenario: Propose finds no prototype HTML
- **WHEN** propose runs and no matching HTML prototypes exist
- **THEN** propose SHALL create a non-UI stub only if the change has no UI impact
- **AND** for a UI change propose SHALL generate and validate an HTML prototype before continuing

### Requirement: Canonical workflow distribution

`.dscode/commands/opsx` and `.dscode/skills/openspec-*` SHALL be the canonical
workflow sources. `.claude` and `.trae` SHALL expose the corresponding commands
and skills through relative symbolic links rather than duplicated files.

#### Scenario: Claude workflow links
- **WHEN** `.claude` workflow entries are inspected
- **THEN** `.claude/commands/opsx` SHALL resolve to `.dscode/commands/opsx`
- **AND** each `.claude/skills/openspec-*` directory SHALL resolve to its matching `.dscode/skills/openspec-*` directory

#### Scenario: Trae workflow links
- **WHEN** `.trae` workflow entries are inspected
- **THEN** `.trae/commands/opsx` SHALL resolve to `.dscode/commands/opsx`
- **AND** each `.trae/skills/openspec-*` directory SHALL resolve to its matching `.dscode/skills/openspec-*` directory

#### Scenario: Apply and archive lifecycle parity
- **WHEN** canonical apply/archive commands and Skills are inspected
- **THEN** both entry types SHALL enforce the same prototype retention and archive lifecycle
