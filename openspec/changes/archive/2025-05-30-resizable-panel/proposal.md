## Why

The web UI sidebar has a fixed width. More importantly, the codebase lacks a general mechanism for resizable panels. If future layouts add a details panel, file browser, or split view, each would need to reimplement the same drag-resize logic. A reusable resizable-panel primitive prevents this duplication and establishes a layout-system capability rather than a one-off sidebar hack.

## What Changes

- Add a reusable `useResizablePanel` hook in `web/src/hooks/` that encapsulates drag-resize behavior (pointer events, clamping, body cursor management, localStorage persistence)
- The hook accepts: min/max width, default width, storage key, optional ref
- The hook returns: current width, a ref to attach to the panel, and handle props (`onPointerDown`)
- Sidebar becomes the first consumer of this hook, replacing its fixed `w-80` with `useResizablePanel`
- CSS for the resize handle lives as a reusable class (`.resize-handle`) rather than sidebar-specific styles

## Capabilities

### New Capabilities
- `resizable-panel`: Reusable drag-resize mechanism for horizontally resizable panels with width persistence

### Modified Capabilities
<!-- None -->

## Impact

- `web/src/hooks/useResizablePanel.ts` — new hook
- `web/src/components/Sidebar.tsx` — consume the hook, render handle
- `web/src/index.css` — generic `.resize-handle` class
- No API or backend changes
