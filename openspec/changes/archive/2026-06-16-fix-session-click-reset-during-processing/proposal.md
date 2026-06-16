## Why

When the agent is actively processing a request, clicking the currently active session item in the sidebar triggers a `session load` command that resets the entire conversation view — destroying in-progress streaming, thinking blocks, tool call results, and messages. This is data-destructive and has no undo. The active session item has no click guard during processing.

## What Changes

- **Fix session item click guard**: When `isProcessing` is true and the user clicks the currently active session, the click is a no-op — the session view remains unchanged. The session item remains visually clickable (normal appearance, no opacity reduction). Only the `onAction` call is suppressed.
- Non-active session items remain disabled (opacity + pointer-events none) during processing, unchanged.
- The Stop button in the input area remains the only user action that interrupts an in-progress turn.

## Capabilities

### New Capabilities
<!-- None — this is a pure bug fix with no new capabilities. -->

### Modified Capabilities
- `web-frontend`: The session list item click behavior spec needs a new scenario: "Active session click is no-op during processing" — clicking the current session while processing does nothing.

## Impact

- **Affected code**: `web/src/components/Sidebar.tsx` — `SessionsPanel` component, the `onClick` handler on line 228.
- **No API changes**, no dependency changes, no breaking changes.
