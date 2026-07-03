## Why

The sidebar session list has no visible "selected" state indicator. When the user clicks a session item, the UI uses `var(--color-accent-bg)` as the active background — but this CSS variable is never defined. The browser resolves it to an invalid value, rendering the active session visually identical to inactive ones. Users cannot tell which session they are currently viewing.

## What Changes

- Define the missing `--color-accent-bg` CSS variable in `:root` (light) and `.dark` themes — a low-opacity tint of the accent color for use as a selected/active background
- The SessionPanel already has correct conditional logic (`isActive ? "var(--color-accent-bg)" : "transparent"`); no JS/TSX changes needed
- Optionally add a subtle left-border accent bar on the active session row for further visual distinction

## Capabilities

### New Capabilities
- `accent-background-token`: A new `--color-accent-bg` semantic token providing a subtle accent-tinted background for selected/active UI states

### Modified Capabilities
- `warm-design-system`: Add `--color-accent-bg` to the minimum token set
- `web-frontend`: The active session row in the sidebar SHALL display a visually distinct background

## Impact

- `web/src/index.css` — add `--color-accent-bg` to `:root` and `.dark`
- `web/src/components/Sidebar.tsx` — no changes needed (already references the variable correctly), but may optionally add a left-border accent bar
