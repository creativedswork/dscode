## 1. Toast system fix

- [x] 1.1 In `web/src/components/Toast.tsx`, replace the render-time `setTimeout` calls in `ToastItem` with a `useEffect` that schedules the timeout and returns a cleanup function
- [x] 1.2 Add auto-dismiss for error toasts: set 8000ms delay when `toast.type === "error"`, keeping info/warning at 3000ms
- [x] 1.3 Verify the `useEffect` dependency array uses `[toast.id, toast.type, onRemove]` — `onRemove` is already stable via `useCallback([], [])`

## 2. Project path whitespace fix

- [x] 2.1 In `web/src/components/Sidebar.tsx`, trim `projectPath` before passing it to `onChange("set_project_path", projectPath)` on the Set button click handler
- [x] 2.2 Verify the displayed input value is NOT trimmed (user sees what they typed, only the sent value is trimmed)

## 3. Verification

- [x] 3.1 Run `npm run typecheck` to ensure no TypeScript errors
- [x] 3.2 Run `npm run build:web` to confirm the frontend builds successfully
- [ ] 3.3 Manually test: enter a project path with leading/trailing spaces, click Set — confirm no spurious error
- [ ] 3.4 Manually test: trigger an error toast, confirm it auto-dismisses after ~8 seconds
- [ ] 3.5 Manually test: click X on an error toast before 8 seconds, confirm it dismisses immediately
