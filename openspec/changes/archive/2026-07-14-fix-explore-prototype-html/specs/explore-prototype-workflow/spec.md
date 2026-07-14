## ADDED Requirements

### Requirement: HTML prototype output directory
HTML prototypes generated during explore mode SHALL be placed in `docs/prototypes/` with the naming convention `<change-name>-<descriptor>.html`.

#### Scenario: Prototype generated during explore
- **WHEN** an explore session triggers HTML prototype generation for change `mcp-tool-progress`
- **THEN** the output file is `docs/prototypes/mcp-tool-progress-<descriptor>.html`

#### Scenario: Multiple prototypes for same change
- **WHEN** the same change requires multiple prototypes (e.g., different states)
- **THEN** each prototype uses a distinct descriptor (e.g., `waiting-state.html`, `done-state.html`)

### Requirement: Prototype constraint file
`docs/prototypes/prototype.md` SHALL exist as a standing constraint file specifying the conventions for HTML prototype generation.

#### Scenario: Constraint file content
- **WHEN** the constraint file is read
- **THEN** it specifies at minimum: output directory (`docs/prototypes/`), file format (self-contained HTML), naming convention, style alignment rules (read `web/index.css` `--color-*` variables), required skill (`html-output`), and lifecycle (retained for future reference)

#### Scenario: Constraint file is read before generation
- **WHEN** an agent is about to generate an HTML prototype
- **THEN** it reads `docs/prototypes/prototype.md` first to obtain constraints

### Requirement: Explore command prototype section
The explore command file (`.claude/commands/opsx/explore.md` and `.clinerules/workflows/opsx-explore.md`) SHALL contain a "Create HTML prototypes for frontend ideas" section under "What You Might Do".

#### Scenario: Detection keywords
- **WHEN** an explore discussion mentions UI, 页面, 界面, 组件, 交互, 样式, 视觉, CSS, frontend, landing, dashboard, 原型, prototype, redesign, or 动效
- **THEN** the agent SHALL naturally offer to create an HTML prototype

#### Scenario: Generation steps
- **WHEN** the user accepts the prototype offer
- **THEN** the agent SHALL: (1) read `docs/prototypes/prototype.md`, (2) load `html-output` skill, (3) extract `--color-*` variables from `web/index.css`, (4) generate self-contained HTML at `docs/prototypes/<name>.html`

#### Scenario: Visual iteration
- **WHEN** a prototype is generated
- **THEN** the agent SHALL accept visual feedback and iterate on the HTML prototype before capturing final design decisions

### Requirement: System Prompt prototype alignment
The System Prompt (AGENTS.md) SHALL describe the HTML prototype workflow consistently with the explore command.

#### Scenario: No markdown prototype reference
- **WHEN** the System Prompt mentions frontend prototyping
- **THEN** it SHALL reference HTML prototypes and `docs/prototypes/`, NOT `prototype.md` as the output format

#### Scenario: Session reference
- **WHEN** the System Prompt describes the prototype workflow
- **THEN** it SHALL reference session 00MRIZMZQJ as a canonical example

### Requirement: Existing prototype migration
The existing `mcp-toolcard-execution-view-prototype.html` at the project root SHALL be moved to `docs/prototypes/mcp-toolcard-execution-view-prototype.html`.

#### Scenario: File moved
- **WHEN** this change is applied
- **THEN** `docs/prototypes/mcp-toolcard-execution-view-prototype.html` exists and the project root copy is removed

### Requirement: OpenSpec config alignment
`openspec/config.yaml` SHALL describe the prototype artifact in terms consistent with the HTML-first workflow.

#### Scenario: Config description updated
- **WHEN** `openspec/config.yaml` is read
- **THEN** the prototype artifact description references HTML prototypes, `docs/prototypes/`, and the `html-output` skill — not `prototype.md` as output and not `openspec instructions prototype` as the generation method
