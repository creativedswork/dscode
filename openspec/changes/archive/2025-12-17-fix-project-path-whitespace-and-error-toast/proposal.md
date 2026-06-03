## Why

Two UI bugs degrade the web frontend experience: (1) setting a project path with leading/trailing whitespace silently fails with an error, and (2) error toast notifications are permanently stuck on screen — the X close button does not work, and there is no auto-dismiss. The only way to clear them is to close and reopen the session.

## What Changes

- **Trim whitespace from project path input**: The Settings panel's project path input will `.trim()` the value before sending it to the server, preventing spurious "path not found" errors caused by accidental leading or trailing spaces.
- **Fix error toast dismissal**: Error toasts will auto-dismiss after 8 seconds. The X close button will also be fixed (it is currently broken due to the render-time `setTimeout` anti-pattern that creates stale closures).
- **Proper side-effect cleanup**: Toast auto-dismiss timeouts will be moved into a `useEffect` with cleanup to avoid scheduling duplicate timers on re-renders.

## Capabilities

### New Capabilities

- `error-toast-auto-dismiss`: Error-level toast notifications auto-dismiss after a configurable delay instead of persisting indefinitely.

### Modified Capabilities

<!-- No existing spec requirements are changing at the spec level. These are implementation fixes within existing behavior. -->

## Impact

- **Affected files**: `web/src/components/Toast.tsx` (timeout side-effect + error auto-dismiss), `web/src/components/Sidebar.tsx` (project path trim)
- **Risk**: Low — minor UI-only changes with no API or protocol impact
- **User-facing**: Yes — error toasts become dismissible (X button works) and auto-dismiss after 8s; project path input tolerates accidental whitespace
