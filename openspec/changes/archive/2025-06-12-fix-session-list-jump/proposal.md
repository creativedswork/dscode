## Why

The web UI's session list sidebar frequently jumps back to the top, making it impossible to scroll through session history or view older sessions. This happens because the server pushes the full session list after every chat turn completion, and the frontend replaces the entire sessions array — causing the scroll container to lose its position during React re-render.

## What Changes

- **Fix session list scroll reset**: The `SessionsPanel` will preserve its scroll position when the sessions array is updated, rather than jumping to the top
- **Reduce unnecessary re-renders**: Only update sessions state when the data has actually changed (deep comparison of key fields), avoiding no-op re-renders that still disrupt scroll
- **Stable scroll container**: Add a `key` to the scroll container and/or use a `useRef` + manual scroll restoration to ensure scroll position survives React reconciliation

## Capabilities

### New Capabilities
- `session-list-scroll-preservation`: The session list sidebar preserves its scroll position across data refreshes and React re-renders

### Modified Capabilities
- `web-frontend`: The conversation view spec's sidebar and session list behavior is updated to include scroll position stability requirements

## Impact

- **Frontend**: `Sidebar.tsx` (SessionsPanel), `App.tsx` (sessions state management)
- **Server**: Optionally reduce `pushSessionList` call frequency (currently called after every chat turn)
- No API changes, no breaking changes, no dependency updates
