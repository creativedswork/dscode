## 1. Wire Protocol — New `set_vision_delete` action

- [x] 1.1 Add `{ type: "config"; action: "set_vision_delete" }` variant to `ClientCommand` in `src/ui/shared/types.ts`
- [x] 1.2 Verify the type propagates correctly to `web/src/types/index.ts` (re-exports from shared)

## 2. Config Persistence — null-key deletion support

- [x] 2.1 Modify `saveUserConfig` in `src/core/config.ts`: after merging, delete any key from result whose value in `partial` is `null`

## 3. Backend — Handle `set_vision_delete` in WebUiBackend

- [x] 3.1 Add `case "set_vision_delete"` in the config switch block of `src/ui/web/web-backend.ts`
- [x] 3.2 In the handler: set `this.config.vision = undefined`, call `saveUserConfig({ vision: null })`, broadcast updated ConfigData, send info event

## 4. Frontend — Conditional Vision Config UI

- [x] 4.1 Add `showVisionForm` local state to `SettingsPanel` in `web/src/components/Sidebar.tsx`
- [x] 4.2 Wrap existing Vision Model JSX block in conditional: render only when `config.vision != null || showVisionForm`
- [x] 4.3 When `config.vision == null && !showVisionForm`: render "Add Vision Model" button (styled as `btn-secondary text-xs w-full`, with `Plus` icon)
- [x] 4.4 Add button `onClick`: set `showVisionForm(true)`
- [x] 4.5 Add `useEffect` watching `config.vision`: when it becomes non-null, reset `showVisionForm(false)`
- [x] 4.6 Add "Delete" button below vision key input (visible only when `config.vision != null`), styled with `var(--color-error-text)`, using `Trash` icon from Phosphor
- [x] 4.7 Delete button `onClick`: call `onChange("set_vision_delete", "")`

## 5. Verification

- [x] 5.1 `npm run typecheck` passes with zero errors
- [ ] 5.2 Manual test: start with no vision config → Settings shows Add button → click Add → form appears → fill in provider/model/key → form stays → click Delete → returns to Add button
- [ ] 5.3 Manual test: restart app → vision is still deleted (persisted correctly)
