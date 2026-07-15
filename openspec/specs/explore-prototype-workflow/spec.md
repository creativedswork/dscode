## Purpose

Defines the HTML-first prototype workflow triggered from explore mode — including output directory conventions, naming rules, constraint file, and skill loading sequence — ensuring visual exploration produces consistent, style-aligned, and retainable HTML artifacts.
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
`docs/prototypes/prototype.md` SHALL exist as a standing constraint file specifying the conventions for HTML prototype generation.

#### Scenario: Constraint file content
- **WHEN** the constraint file is read
- **THEN** it specifies at minimum: output directory (`docs/prototypes/`), file format (self-contained HTML), naming convention, style alignment rules (read `web/index.css` `--color-*` variables), required skill (`html-output`), and lifecycle (retained for future reference)

#### Scenario: Constraint file is read before generation
- **WHEN** an agent is about to generate an HTML prototype
- **THEN** it reads `docs/prototypes/prototype.md` first to obtain constraints

### Requirement: Explore command prototype section
The explore command file (`.dscode/commands/opsx/explore.md`, `.clinerules/workflows/opsx-explore.md`, and `.claude/commands/opsx/explore.md`) SHALL contain a "Create HTML prototypes for frontend ideas" section under "What You Might Do" AND an "Ending Discovery" section that unconditionally directs to `/opsx:propose`.

#### Scenario: Detection keywords
- **WHEN** an explore discussion mentions UI, 页面, 界面, 组件, 交互, 样式, 视觉, CSS, frontend, landing, dashboard, 原型, prototype, redesign, or 动效
- **THEN** the agent SHALL naturally offer to create an HTML prototype

#### Scenario: Generation steps
- **WHEN** the user accepts the prototype offer
- **THEN** the agent SHALL: (1) read `docs/prototypes/prototype.md`, (2) load `html-output` skill, (3) extract `--color-*` variables from `web/index.css`, (4) generate self-contained HTML at `docs/prototypes/<name>.html`

#### Scenario: Visual iteration
- **WHEN** a prototype is generated
- **THEN** the agent SHALL accept visual feedback and iterate on the HTML prototype before capturing final design decisions

#### Scenario: Ending discovery unconditionally goes to propose
- **WHEN** explore ends, regardless of whether a prototype was created
- **THEN** the agent SHALL direct the user to `/opsx:propose` as the next step and SHALL NOT suggest `/opsx:apply`

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
For changes involving UI components, pages, or visual interaction, the `prototype.md` artifact SHALL reference HTML prototype files from `docs/prototypes/` and capture key design decisions refined during visual iteration.

#### Scenario: UI change prototype artifact
- **WHEN** the change involves UI and HTML prototypes exist in `docs/prototypes/`
- **THEN** `prototype.md` SHALL list each prototype file path, summarize the visual direction, and reference the design decisions confirmed during explore

#### Scenario: UI change without HTML prototype
- **WHEN** the change involves UI but no HTML prototype was created during explore
- **THEN** `prototype.md` SHALL state that no prototype was generated and include a brief visual direction description based on design.md

### Requirement: Prototype artifact content for non-UI changes
For changes that do not involve UI, the `prototype.md` artifact SHALL contain a stub stating no prototype is needed with a one-line rationale.

#### Scenario: Non-UI change prototype stub
- **WHEN** the change is backend-only, config, or refactoring with no UI impact
- **THEN** `prototype.md` SHALL contain a "No prototype needed" section with a brief reason (e.g., "backend-only change affecting X module")

### Requirement: Unconditional explore to propose flow
The explore command SHALL always direct the user to `/opsx:propose` as the next step after exploration. The explore command SHALL NEVER suggest `/opsx:apply` directly.

#### Scenario: Explore ending with prototype
- **WHEN** explore completes and an HTML prototype was created in `docs/prototypes/`
- **THEN** the explore command SHALL say to run `/opsx:propose` next, mentioning the prototype will be incorporated

#### Scenario: Explore ending without prototype
- **WHEN** explore completes and no prototype was created
- **THEN** the explore command SHALL say to run `/opsx:propose` next

### Requirement: Propose command prototype awareness
The propose command SHALL check `docs/prototypes/` for HTML prototype files matching the change name before creating the prototype artifact.

#### Scenario: Propose finds prototype HTML
- **WHEN** propose runs and `docs/prototypes/` contains HTML files matching the change name
- **THEN** propose SHALL read those files and use them as design source-of-truth when creating the prototype artifact

#### Scenario: Propose finds no prototype HTML
- **WHEN** propose runs and no matching HTML prototypes exist
- **THEN** propose SHALL create a non-UI stub prototype artifact (if the change has no UI impact) or offer to generate a prototype first (if the change has UI impact)

