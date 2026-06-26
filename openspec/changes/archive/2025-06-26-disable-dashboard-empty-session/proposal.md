## Why

When no session exists (`currentSessionId === null`), the `ViewModeSwitcher` dropdown allows the user to select "Dashboard" mode. Since there is no session to generate a dashboard for, this results in an empty/meaningless dashboard view and a wasted `artifact:generate` request to the backend. The switcher should be disabled when there is no active session.

## What Changes

- `ViewModeSwitcher` gains a `disabled` prop that applies `opacity: 0.4` + `pointer-events: none` to the `<select>`, consistent with the existing disabled pattern used throughout Sidebar
- `App.tsx` passes `disabled={currentSessionId === null}` to `ViewModeSwitcher`
- `handleViewModeChange` adds a guard clause as defense-in-depth: if `currentSessionIdRef.current` is null, return early without changing mode

## Capabilities

### Modified Capabilities
- `web-frontend`: The dashboard mode switcher SHALL be visually disabled when no session is active

## Impact

- `web/src/components/ViewModeSwitcher.tsx` — add `disabled` prop
- `web/src/components/App.tsx` — pass `disabled`, add guard in `handleViewModeChange`
