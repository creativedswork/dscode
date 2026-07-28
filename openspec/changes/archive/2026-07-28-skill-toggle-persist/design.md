## Context

The web UI skill toggle (from `skill-panel-live-data`) allows users to activate/deactivate skills in-memory via `SkillManager.activate()`/`deactivate()`. However:

1. **No persistence**: On process restart, `harness.initialize()` auto-activates every discovered skill (line 97-102). Any deactivated skills are re-activated.
2. **No session-scope effect**: `baseSystemPrompt` is built once in `initialize()` (line 124-125). Starting a new session via `/reset` or loading a saved session does not rebuild it. The model continues to see the startup-time skill list.

### Current code paths

**Startup** (`harness.initialize()`, line 97-102):
```typescript
for (const name of this.skillManager.listAllSkillNames()) {
  this.skillManager.activate(name, this.driverRegistry);
}
```

**System prompt build** (`harness.initialize()`, line 124):
```typescript
const skillSection = this.skillManager.getSystemPromptSection();
this.baseSystemPrompt = this.buildSystemPrompt(memories, skillSection, ...);
```

**Per-request** (transformContext hook, line 163):
```typescript
self.agent.state.systemPrompt = self.baseSystemPrompt.replace(...)
```

**Settings schema**: `<project>/.dscode/settings.json` already supports custom fields. The `HarnessConfig.skills` field (line 36 of types.ts) is an additive list read from settings but currently redundant since all skills are auto-activated.

## Goals / Non-Goals

**Goals:**
- Toggle state persists across process restarts
- Disabled skills stay inactive on startup
- Starting a new session picks up the current toggle state
- Mid-session toggle does NOT affect the current conversation (preserves prompt cache)

**Non-Goals:**
- Per-session skill override (always global via settings.json)
- UI for editing settings.json directly
- Changing the agent's tool set mid-turn

## Decisions

### Decision 1: `disabledSkills` in settings.json (not repurpose `skills`)

**Chosen**: Add `disabledSkills: string[]` to settings.json. The existing `skills` field remains unchanged.

**Why not repurpose `skills`**: The `skills` field in `HarnessConfig` is already used as an additive list. Changing its semantics to be exclusionary would be a breaking change for existing configurations. A separate `disabledSkills` field is unambiguous.

**settings.json example**:
```json
{
  "disabledSkills": ["web-game-design", "image-to-code"]
}
```

### Decision 2: `baseSystemPrompt` rebuild on `agent.reset()`

**Chosen**: In `harness.agentResetHook()` (or wherever `agent.reset()` is called), rebuild `baseSystemPrompt` from the current `SkillManager` state.

**Rationale**: `agent.reset()` is called when:
- Starting a new session (`/reset`)
- Switching model/provider
- Loading a saved session (via `sessionManager.loadSession()` → the web backend handles this separately but the principle is the same)

Rebuilding at this boundary ensures the next conversation turn uses the current skill state without invalidating the prompt cache mid-conversation.

### Decision 3: Persist on every toggle

**Chosen**: In `web-backend.handleSkill()`, after calling `SkillManager.activate/deactivate`, call `saveProjectSettings()` to write/remove the skill from `disabledSkills`.

**Rationale**: No separate "save" button needed. The toggle IS the save action. This matches the user's expectation that flipping a switch persists it.

## Data Flow

```
Web UI Toggle OFF
  ─────────────────────────────────▶  web-backend.handleSkill()
                                       │
                                       ├─ SkillManager.deactivate(name)
                                       ├─ pushSkillState() → broadcast to frontends
                                       └─ saveProjectSettings({
                                            disabledSkills: [...prev, name]
                                          })
                                       │
                                       ▼
                                    .dscode/settings.json ✓

Process Restart
  ─────────────────────────────────▶  loadConfig()
                                       │
                                       ├─ read settings.json
                                       └─ config.disabledSkills = [...]

                                    harness.initialize()
                                       │
                                       ├─ for each discovered skill:
                                       │    if name NOT in disabledSkills:
                                       │      SkillManager.activate(name)
                                       │
                                       └─ buildSystemPrompt() ← only active skills

New Session (/reset, load session)
  ─────────────────────────────────▶  harness.agentResetHook()
                                       │
                                       ├─ agent.reset()
                                       ├─ rebuild baseSystemPrompt()
                                       └─ next promptAndSave() uses new prompt
```

## Risks / Trade-offs

- **Settings.json write on every toggle**: Acceptable — toggles are infrequent, and the file is small.
- **`saveProjectSettings` requires `projectPath`**: Already available in `WebUiBackend` via `this.config.projectPath`.
- **Concurrent writes**: Two frontend clients toggling simultaneously could race. Acceptable — last write wins, and the in-memory state is consistent.
