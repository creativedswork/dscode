## Why

The skill toggle in the web UI changes `SkillManager` in-memory state, but has no persistent effect. On restart, all discovered skills are auto-activated again. The toggle also doesn't take effect in the current session because `baseSystemPrompt` is built once at startup and never rebuilt when the conversation context resets.

## What Changes

- **Persist toggle state**: Write `disabledSkills` to `<project>/.dscode/settings.json` when a skill is toggled off; remove when toggled on
- **Skip disabled skills at startup**: `SkillManager` initialization reads `disabledSkills` and skips auto-activation for listed skills
- **Rebuild system prompt on session reset**: When `agent.reset()` is called (new session, model switch, etc.), rebuild `baseSystemPrompt` so skill changes take effect for the next conversation

## Capabilities

### New Capabilities

- `skill-persistence`: Skill activation state is persisted across restarts via settings.json
- `skill-session-scope`: Skill activation state takes effect when starting a new conversation session

## Impact

- `src/core/types.ts` — add `disabledSkills: string[]` to `HarnessConfig`
- `src/core/config.ts` — read `disabledSkills` from settings.json in `loadConfig()`
- `src/core/harness.ts` — skip disabled skills in `initialize()`; rebuild `baseSystemPrompt` on `agent.reset()`
- `src/ui/web/web-backend.ts` — call `saveProjectSettings()` on skill toggle to persist `disabledSkills`
- `openspec/specs/skill-management-ui/spec.md` — add persistence and session-scope scenarios
