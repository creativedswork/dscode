## MODIFIED Requirements

### Requirement: LLM autonomously generates rules from full CHIFF context

The `eval-rule-attribution` Agent Application SHALL generate Harness Rules from the complete validated CHIEF context.

Its input SHALL include:

- target task and Session metadata
- real Actor inventory with Agent ID, Application, role, parent, Application source/digest, and evidence quality
- Subtasks and Virtual Oracles
- Agent/control/data graph paths
- Subtask, Agent, and Step candidate sets
- final root-cause Actor, Step/granularity, confidence, and screening evidence
- cross-Agent Recovery Arcs
- local trajectory fragments around the root cause
- configuration excerpts for the responsible Agent Application when available
- shared Harness/AGENTS.md/Skill configuration relevant to the finding

Each generated rule SHALL identify whether its suggestion targets a specific Agent Application or a shared Harness layer. Application-specific suggestions MUST reference the Application name/source, not a transient Agent ID. Rules SHALL remain de-concretized and MUST NOT encode Session IDs or Step numbers in their reusable abstract/suggestion.

#### Scenario: Rule targets responsible SubAgent Application

- **WHEN** root cause belongs to an Explorer Agent and evidence implicates Explorer's system prompt
- **THEN** the rule SHALL target the Explorer Application definition/source
- **AND** SHALL use the Agent ID only as evidence
- **AND** SHALL not recommend changing the Main Agent prompt by default

#### Scenario: Rule targets shared Harness behavior

- **WHEN** failures across multiple Applications originate from a shared tool contract
- **THEN** the rule SHALL target the shared tool/Harness layer
- **AND** MAY include evidence from multiple Agent IDs

#### Scenario: Application snapshot unavailable

- **WHEN** attribution identifies a summary-only legacy Agent without an Application source snapshot
- **THEN** the worker SHALL not invent an Application file path
- **AND** MAY produce a shared-layer rule marked with partial evidence
- **OR** MAY return no rule when evidence is insufficient

#### Scenario: No config issue

- **WHEN** CHIEF attribution finds an execution-specific error with no justified configuration change
- **THEN** the worker MAY return an empty `HarnessRule[]`
- **AND** the Dashboard SHALL display that no Agent configuration issue was detected

#### Scenario: Recovery pattern informs rule

- **WHEN** one Agent causes an error and another Agent corrects it after repeated misdiagnosis
- **THEN** the worker MAY derive a rule from the cross-Agent recovery pattern
- **AND** SHALL preserve the distinction between error and correction Applications in evidence

### Requirement: LLM output validation and retry

The eval coordinator SHALL validate the `eval-rule-attribution` worker output using the existing typed HarnessRule validators plus Actor/Application reference validation.

Invalid output SHALL trigger one fresh process retry with validation feedback. If both attempts fail, the coordinator SHALL log the failure, use an empty rule list, and continue Dashboard generation because rule extraction is supplementary to validated CHIEF attribution.

#### Scenario: Valid Application target

- **WHEN** a rule targets an Application present in the trajectory or a known shared layer
- **THEN** it SHALL pass target validation

#### Scenario: Unknown Application target

- **WHEN** a rule claims an Application-specific change for an unknown Application
- **THEN** validation SHALL reject the output
- **AND** the retry prompt SHALL identify the unknown target

#### Scenario: Two invalid outputs

- **WHEN** both rule worker attempts fail validation
- **THEN** `EvalResult.rules` SHALL be empty
- **AND** CHIEF root-cause attribution and Dashboard generation SHALL continue

## RENAMED Requirements

- FROM: `LLM autonomously generates rules from full CHIFF context`
- TO: `LLM autonomously generates rules from full CHIEF Multi-Agent context`
