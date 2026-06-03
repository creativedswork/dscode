## Context

The web frontend has a lightweight toast notification system (`web/src/components/Toast.tsx`) that displays info, warning, and error messages. Currently:
- Info and warning toasts auto-dismiss after 3 seconds via `setTimeout` called directly in the component body during render.
- Error toasts have no auto-dismiss AND their X close button does not work. The only way to remove an error toast is to close and reopen the entire session.
- The `setTimeout` calls in the render body are a React anti-pattern: they fire on every render as an unmanaged side effect, scheduling duplicate timers without cleanup. This likely causes stale closures that break the X button handler for error toasts.

The Settings panel in the sidebar (`web/src/components/Sidebar.tsx`) has a "Project Path" input field. When the user clicks "Set", the raw input value is sent to the server via `onChange("set_project_path", projectPath)`. Leading/trailing whitespace in the path causes the server to reject it, producing an error toast that then cannot be dismissed.

## Goals / Non-Goals

**Goals:**
- Trim leading/trailing whitespace from the project path before sending
- Auto-dismiss error toasts after a longer delay (8 seconds)
- Move timeout side-effects into proper `useEffect` with cleanup to prevent duplicate timer scheduling
- Preserve manual X-button dismissal for all toast types

**Non-Goals:**
- Refactoring the entire toast system (out of scope for a bug fix)
- Adding a configurable toast duration via user settings
- Changing toast styling or layout
- Adding a toast queue or notification center

## Decisions

### 1. Error toast auto-dismiss duration: 8 seconds

**Rationale**: Error messages are more important than info/warnings and users need time to read them. 8 seconds provides enough reading time while still auto-clearing. This matches common UI patterns (e.g., VS Code notifications default to ~8s for errors, macOS Notification Center uses ~5-10s for alerts).

**Alternatives considered**:
- 5 seconds: Too short for long error messages
- Never auto-dismiss + broken X button: Current behavior — error toasts are dead UI that require a full session restart to clear, unacceptable
- User-configurable: Over-engineered for this fix

### 2. Use `useEffect` for timeout management

**Rationale**: The current approach of calling `setTimeout` directly in the component body is a React anti-pattern. It schedules a new timer on every render without cleaning up old ones, leading to stale closures and duplicate dismissals. Moving to `useEffect` with a cleanup function that calls `clearTimeout` ensures only one active timer per toast.

**Implementation approach**:
```tsx
useEffect(() => {
  let delay: number | null = null;
  if (toast.type === "info" || toast.type === "warning") delay = 3000;
  else if (toast.type === "error") delay = 8000;
  
  if (delay === null) return;
  
  const timer = setTimeout(() => onRemove(toast.id), delay);
  return () => clearTimeout(timer);
}, [toast.id, toast.type, onRemove]);
```

### 3. Trim project path on send, not on input

**Rationale**: Trimming on the send action (button click) is the least invasive fix. Trimming `onChange` would alter the displayed value while the user is typing, which can be disorienting. Trimming only on send preserves the user's typed input visually but sends a clean value to the server.

## Risks / Trade-offs

- **Risk**: 8-second auto-dismiss might close an error before the user finishes reading a very long message → **Mitigation**: Error messages from the server are typically short (one line). The X button is also fixed by the `useEffect` refactor and works reliably for immediate dismissal.
- **Risk**: `useEffect` dependency on `onRemove` could cause re-renders if the parent doesn't memoize → **Mitigation**: `onRemove` (`removeToast` from `useToasts`) is already wrapped in `useCallback` with `[]` deps, so it's stable.
