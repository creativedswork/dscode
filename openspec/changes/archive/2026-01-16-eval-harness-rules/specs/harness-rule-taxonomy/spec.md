## ADDED Requirements

### Requirement: Rule taxonomy maps to Agent configuration layers

The system SHALL define a `RuleCategory` enum with values: `"identity"`, `"tool_use"`, `"tool_registry"`, `"agents_md"`, `"skill"`. Each category SHALL map to a specific layer of the dscode Agent configuration:

| Category       | Config Layer              | Example Target                          |
|----------------|---------------------------|-----------------------------------------|
| `identity`     | `# Identity` + `# Soul`   | Identity drift, soul absence            |
| `tool_use`     | `# Tool Use §Rules`       | Act-first violation, file-over-shell     |
| `tool_registry`| ToolRegistry state        | Description mismatch, classify wrong     |
| `agents_md`    | `# AGENTS.md`             | Style violation, file length violation   |
| `skill`        | `# Skills`                | Skill unused, instruction weak           |

#### Scenario: All categories cover the full system prompt

- **WHEN** a rule is created with any `RuleCategory`
- **THEN** the category SHALL correspond to at least one section in the system prompt built by `Harness.buildSystemPrompt()`
- **AND** each section of the system prompt SHALL be covered by at least one `RuleCategory`

### Requirement: HarnessRule type definition

The system SHALL define a `HarnessRule` interface with the following fields:

- `id: string` — unique rule identifier (e.g., `"R_PREFER_FILE_OVER_SHELL"`)
- `category: RuleCategory` — which config layer this rule targets
- `targetLayer: string` — finer-grained target within the layer (e.g., `"system_prompt.tool_use.rules.4"`)
- `abstract: string` — human-readable description of the rule, decoupled from any specific session
- `pattern: RulePattern` — machine-detectable trigger condition
- `severity: number` — 0.0 to 1.0, derived from evidence count
- `evidence: RuleEvidence[]` — accumulated evidence across sessions
- `suggestion: RuleSuggestion` — actionable modification to Agent config

#### Scenario: HarnessRule is serializable

- **WHEN** a `HarnessRule` is serialized to JSON
- **THEN** all fields SHALL be preserved in the serialized form
- **AND** deserialization SHALL reconstruct an equivalent `HarnessRule`

### Requirement: RulePattern defines machine-detectable triggers

The system SHALL define a `RulePattern` interface with:

- `type: "statistical" | "behavioral" | "structural"` — the detection method
- `detector: string` — the detector function name
- `threshold: number` — the trigger threshold
- `params?: Record<string, unknown>` — optional detector-specific parameters

`statistical` patterns SHALL use session-level statistics (ratios, counts). `behavioral` patterns SHALL match sequences of agent actions. `structural` patterns SHALL check properties of generated files.

#### Scenario: Statistical pattern detection

- **WHEN** a rule has `pattern.type = "statistical"` and `pattern.detector = "bashFileOpRatio"`
- **THEN** the detector SHALL compute `bash_file_ops / total_bash_calls` from session messages
- **AND** the rule SHALL trigger when the ratio exceeds `pattern.threshold`

#### Scenario: Behavioral pattern detection

- **WHEN** a rule has `pattern.type = "behavioral"` and `pattern.detector = "consecutiveFailedEdits"`
- **THEN** the detector SHALL scan for sequences of ≥N consecutive edit tool calls on the same file with error results
- **AND** the rule SHALL trigger when such a sequence is found with N ≥ `pattern.threshold`

### Requirement: RuleEvidence accumulates across sessions

The system SHALL define a `RuleEvidence` interface with:

- `sessionId: string` — the session where the rule triggered
- `timestamp: number` — Unix ms when the evidence was recorded
- `occurrences: number` — how many times the pattern fired in this session
- `sampleSteps: number[]` — representative step indices (max 5)

#### Scenario: Evidence accumulation within a session

- **WHEN** a detector fires 3 times in the same session for rule R_X
- **THEN** a single `RuleEvidence` SHALL be created with `occurrences = 3`
- **AND** `sampleSteps` SHALL contain up to 5 step indices where the pattern occurred

### Requirement: RuleSuggestion points to concrete config modifications

The system SHALL define a `RuleSuggestion` interface with:

- `layer: string` — exact config section path (e.g., `"system_prompt.tool_use.rules.4"`)
- `action: "modify" | "add" | "remove" | "reorder"` — the type of change
- `current?: string` — current text (for `modify` actions, to generate a diff)
- `proposed: string` — proposed text
- `rationale: string` — why this change is recommended

#### Scenario: Modify suggestion with diff context

- **WHEN** a rule suggests modifying the Tool Use rule about file tools
- **THEN** `suggestion.current` SHALL contain the existing rule text
- **AND** `suggestion.proposed` SHALL contain the suggested replacement
- **AND** `suggestion.rationale` SHALL explain the evidence

### Requirement: Pre-defined rule catalog

The system SHALL ship with a pre-defined catalog of at least 15 HarnessRules covering all 5 RuleCategories. Each rule in the catalog SHALL have a unique `id`, a defined `pattern` with a registered `detector`, and a `suggestion` template.

#### Scenario: Catalog coverage

- **WHEN** the rule catalog is loaded
- **THEN** at least 3 rules SHALL exist for `tool_use` category
- **AND** at least 2 rules SHALL exist for `tool_registry` category
- **AND** at least 2 rules SHALL exist for `identity` category
- **AND** at least 1 rule SHALL exist for `agents_md` category
- **AND** at least 1 rule SHALL exist for `skill` category

#### Scenario: Catalog rule has valid detector

- **WHEN** a rule from the catalog is evaluated
- **THEN** its `pattern.detector` SHALL resolve to a callable TypeScript function
- **AND** calling the detector with session data SHALL return a numeric result
