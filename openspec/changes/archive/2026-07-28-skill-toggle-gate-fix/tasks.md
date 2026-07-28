## 1. Skill tool gate — reject inactive skills

- [x] 1.1 In `harness.ts` `skill` tool `execute` function (around line 930), after `getManifest()` succeeds, add `skillManager.isActive(params.name)` check. If skill exists but is not active, return error: `"Skill '${name}' is currently deactivated. Use the Skills panel to activate it first."`

## 2. System prompt — reference active skills only

- [x] 2.1 In `harness.ts` line 848, change `"any Skill listed in 'Available Skills'"` to `"any Skill listed in 'Active Skills'"`

## 3. Initialize — remove duplicate activation loop

- [x] 3.1 In `harness.ts` `initialize()`, delete lines 113-125 (the second `for` block that activates all skills without checking `disabled`)
- [x] 3.2 Run `npm run typecheck` to verify no compile errors
