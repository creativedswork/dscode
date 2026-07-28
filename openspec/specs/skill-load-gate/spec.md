# skill-load-gate Specification

## Purpose
TBD - created by archiving change skill-toggle-gate-fix. Update Purpose after archive.
## Requirements
### Requirement: Skill tool rejects inactive skills

The `skill` tool SHALL reject requests to load a deactivated skill by returning an error message instead of loading the skill's instructions.

#### Scenario: Loading an active skill succeeds
- **WHEN** the model calls the `skill` tool with the name of an active skill
- **THEN** the tool SHALL return the skill's full instructions (frontmatter + content)
- **AND** the response SHALL include the skill name, description, source, allowed tools, and instructions

#### Scenario: Loading an inactive skill is rejected
- **WHEN** the model calls the `skill` tool with the name of a skill that exists but is deactivated
- **THEN** the tool SHALL return an error message indicating the skill is deactivated
- **AND** the error message SHALL include the skill name and a hint to use the Skills panel to activate it

#### Scenario: Loading a non-existent skill is rejected
- **WHEN** the model calls the `skill` tool with a name that does not match any discovered skill
- **THEN** the tool SHALL return an error message indicating the skill was not found

### Requirement: System prompt instructs model to use active skills only

The system prompt instruction that tells the model how to use skills SHALL reference only the "Active Skills" section, not "Available Skills".

#### Scenario: System prompt references active skills
- **WHEN** the system prompt is built
- **THEN** the instruction SHALL say "any Skill listed in 'Active Skills'" or equivalent that references only activated skills
- **AND** it SHALL NOT instruct the model to call the `skill` tool for inactive skills

### Requirement: Disabled skills are not activated at startup

The `initialize()` method SHALL NOT re-activate skills listed in `disabledSkills` through duplicate activation loops.

#### Scenario: Only one activation pass runs at startup
- **WHEN** `harness.initialize()` is called
- **AND** `disabledSkills` contains `["web-game-design"]`
- **THEN** the activation logic SHALL run exactly once per discovered skill
- **AND** `SkillManager.activate()` SHALL NOT be called for "web-game-design" in any pass
- **AND** "web-game-design" SHALL remain inactive

