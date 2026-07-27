## Why

The editorial workshop redesign (web-ui-editorial-workshop) shipped a distinctive studio aesthetic, but post-launch usage revealed three friction points: the typographic scale is too aggressive at the small end (10px labels, 13px panel titles), detail panels are locked at a hardcoded 280px with no resize handle, and the Skill Marketplace button is a dead UI element with no click behavior. These issues collectively make the UI feel cramped and unfinished — the "大气" (generous/spacious) quality present in the empty state doesn't carry through to daily use.

## What Changes

- **Typographic scale bump**: All UI chrome type sizes increase 1-2px. Section labels 10→11px, panel titles 13→15px (matching the original spec that called for 15px), skill names 12→13px, descriptions 10→11px, tags 9→10px, buttons 10→11px / 11→12px. The editorial contrast between chrome and content is preserved, just shifted to a more readable baseline.
- **Resizable detail panel**: The existing `useResizablePanel` hook (from `resizable-panel` spec) is applied to the detail panel (Sessions/MCP/Skills/Settings). Default width increases from 280px to 320px, resizable range 240-480px. The main sidebar already supports resize — this extends the same capability to the secondary panel.
- **Marketplace button disabled state**: The "Browse Marketplace" button in the Skills panel gains `disabled` attribute and a tooltip ("Coming soon — marketplace integration planned") to communicate that the feature is a placeholder awaiting backend support.

## Capabilities

### New Capabilities
- `resizable-detail-panel`: Detail panels (Sessions, MCP, Skills, Settings) gain drag-to-resize via the existing `useResizablePanel` hook. Default width 320px, range 240-480px, persisted to localStorage.

### Modified Capabilities
- `editorial-workshop-layout`: Typographic scale adjusted — section labels 10→11px, panel titles 13→15px, detail panel default width 280→320px with resize handle.
- `skill-management-ui`: Skill card typography bumped (name 12→13px, description 10→11px, tags 9→10px), marketplace button disabled with tooltip.
- `settings-panel-ui`: Settings label typography bumped (section labels 10→11px, select text 11→12px, cache stat 14→16px).
- `web-frontend`: Detail panel uses resizable width instead of hardcoded 280px. Sidebar icons scale from 14px to 15px to match the broader scale adjustment.

## Impact

- `web/src/components/Sidebar.tsx`: Apply `useResizablePanel` to detail panel, add resize handle, update hardcoded widths and typography classes
- `web/src/index.css`: Update CSS component classes (`.skill-card`, `.market-banner`, `.market-btn`, `.settings-card`, `.settings-select`, `.skill-tag`, `.skill-name` font-sizes)
- `web/src/hooks/useResizablePanel.ts`: Unchanged (hook is already generic and shared)
- No backend changes, no new dependencies, no protocol changes
