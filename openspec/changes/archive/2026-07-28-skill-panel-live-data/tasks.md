## 1. Shared types

- [x] 1.1 Add `SkillInfo` interface to `src/ui/shared/types.ts`: fields `name`, `description`, `active`, `source`, `toolsCount`
- [x] 1.2 Add `skill_state` variant to `ServerEvent`: `{ type: "skill_state"; skills: SkillInfo[] }`
- [x] 1.3 Add `skill` variant to `ClientCommand`: `{ type: "skill"; action: "toggle"; name: string }`

## 2. Backend — push skill state

- [x] 2.1 In `web-backend.ts`, add `pushSkillState(client)` method that calls `SkillManager.listAll()`, maps to `SkillInfo[]`, and broadcasts `{ type: "skill_state", skills }`
- [x] 2.2 Call `pushSkillState(client)` in `handleConnect` so the frontend gets skill data on connection, alongside existing `pushSessionList` and `pushMcpState`
- [x] 2.3 Subscribe to a skill change event (or simply call `pushSkillState` inside the toggle handler) so other connected clients stay in sync

## 3. Backend — handle toggle

- [x] 3.1 In `handleMessage`, add case for `{ type: "skill", action: "toggle" }`: call `SkillManager.activate(name)` or `SkillManager.deactivate(name)`
- [x] 3.2 After toggling, call `pushSkillState(client)` to broadcast updated state to all clients

## 4. Frontend — SkillInfo type

- [x] 4.1 Export `SkillInfo` from `web/src/types/index.ts` (re-export from `@dscode/shared/types`)

## 5. Frontend — App state

- [x] 5.1 In `App.tsx`, store `skills: SkillInfo[]` in state
- [x] 5.2 Handle `{ type: "skill_state" }` ServerEvent: update `skills` state
- [x] 5.3 Add `toggleSkill(name)` function that sends `{ type: "skill", action: "toggle", name }` ClientCommand
- [x] 5.4 Pass `skills` and `toggleSkill` as props to `Sidebar`

## 6. Frontend — Sidebar

- [x] 6.1 Add `skills: SkillInfo[]` and `onToggleSkill: (name: string) => void` to `SidebarProps`
- [x] 6.2 Replace `installedSkillCount = 5` with `skills.filter(s => s.active).length`
- [x] 6.3 Pass `skills` and `onToggleSkill` to `DetailSkillsPanel`

## 7. Frontend — DetailSkillsPanel

- [x] 7.1 Accept `skills: SkillInfo[]` and `onToggle: (name: string) => void` as props
- [x] 7.2 Remove hardcoded Installed/Available arrays
- [x] 7.3 Split `skills` into `activeSkills` and `inactiveSkills` by `skill.active`
- [x] 7.4 Render "Active" section with active skill cards (icon, name, desc, tool count tag, source tag, toggle=on)
- [x] 7.5 Render "Inactive" section with inactive skill cards (opacity 0.65, toggle=off)
- [x] 7.6 Add empty state for "Inactive" when all skills are active: "All skills are active"
- [x] 7.7 Add loading state while `skills` is null/undefined: "Loading skills…"
- [x] 7.8 Keep Marketplace banner section unchanged
- [x] 7.9 Add CSS for skill card icon (accent on active, muted on inactive), toggle alignment, and card opacity
