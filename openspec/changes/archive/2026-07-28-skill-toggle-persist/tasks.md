## 1. Config layer — disabledSkills

- [x] 1.1 Add `disabledSkills: string[]` to `HarnessConfig` in `src/core/types.ts`
- [x] 1.2 In `src/core/config.ts` `loadConfig()`, read `disabledSkills` from user + project settings, merge and deduplicate

## 2. Startup — skip disabled skills

- [x] 2.1 In `harness.initialize()`, wrap the auto-activation loop to skip skills in `config.disabledSkills`
- [x] 2.2 In `harness.updateProjectPath()`, apply the same skip logic during skill reload (already handled by `reloadDirs` which only re-activates previously active skills)

## 3. Session reset — rebuild baseSystemPrompt

- [x] 3.1 Add a public method `rebuildSystemPrompt()` in harness that rebuilds `baseSystemPrompt` from current `SkillManager.getSystemPromptSection()` and `MemoryManager.getRelevantMemories()`
- [x] 3.2 Call `rebuildSystemPrompt()` wherever `agent.reset()` is called (setModel, setProvider)
- [x] 3.3 Call `rebuildSystemPrompt()` in the `/reset` command handler

## 4. Web backend — persist on toggle

- [x] 4.1 In `web-backend.ts` `handleSkill()`, after calling `SkillManager.activate/deactivate`, read current `disabledSkills` from project settings
- [x] 4.2 On deactivate: add skill name to `disabledSkills`, call `saveProjectSettings()`
- [x] 4.3 On activate: remove skill name from `disabledSkills`, call `saveProjectSettings()`
- [x] 4.4 Import `saveProjectSettings` from `../../core/config.js`
