## ADDED Requirements

### Requirement: Skill toggle persistence

The skill activation state SHALL be persisted to `<project>/.dscode/settings.json` so that disabled skills remain inactive across process restarts.

#### Scenario: Deactivating a skill persists to settings
- **WHEN** the user toggles a skill off in the web UI
- **THEN** the skill name SHALL be added to `disabledSkills` array in `<project>/.dscode/settings.json`
- **AND** the file SHALL be written immediately

#### Scenario: Activating a skill removes from settings
- **WHEN** the user toggles a skill on in the web UI
- **THEN** the skill name SHALL be removed from `disabledSkills` array in `<project>/.dscode/settings.json`
- **AND** the file SHALL be written immediately

#### Scenario: Disabled skills are not activated on startup
- **WHEN** the process starts
- **AND** `disabledSkills` in settings.json contains `["web-game-design"]`
- **THEN** `SkillManager.activate()` SHALL NOT be called for "web-game-design"
- **AND** "web-game-design" SHALL appear as inactive in the system prompt's "Available Skills" section

### Requirement: Skill state takes effect on new session

The skill activation state SHALL take effect when starting a new conversation session, without requiring a process restart.

#### Scenario: System prompt is rebuilt on session reset
- **WHEN** `agent.reset()` is called (via `/reset`, model switch, or loading a saved session)
- **THEN** `baseSystemPrompt` SHALL be rebuilt from the current `SkillManager.getSystemPromptSection()`
- **AND** the new system prompt SHALL reflect the current active/inactive skill state

#### Scenario: Mid-session toggle does not affect current conversation
- **WHEN** the user toggles a skill while in an active conversation
- **THEN** the current turn and subsequent turns in the same session SHALL continue using the previous system prompt
- **AND** the change SHALL take effect after the next session reset

## MODIFIED Requirements

### Requirement: Skills panel in sidebar (modified)

The skills panel SHALL reflect the persisted skill activation state from `SkillManager`, which is derived from `disabledSkills` in settings.json at startup.

**Change**: The sidebar badge count and detail panel now reflect persisted state. No functional change to the UI — the data source is still `SkillManager.listAll()`, but now the active/inactive state is preserved across restarts.

#### Scenario: Skills nav item with live count (unchanged)
- **WHEN** the sidebar renders
- **THEN** a "Skills" nav item SHALL appear with a star icon and a count badge showing the current number of active skills from `SkillManager.listAll()`
- **AND** the badge SHALL update when skills are activated or deactivated

#### Scenario: Toggle persists to disk (new)
- **WHEN** the user clicks the toggle on any skill card
- **THEN** the toggle action SHALL call `SkillManager.activate()` or `SkillManager.deactivate()`
- **AND** the change SHALL be persisted to `<project>/.dscode/settings.json` via `saveProjectSettings()`
- **AND** the `pushSkillState()` broadcast SHALL notify all connected clients
