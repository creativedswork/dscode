## 1. CSS typographic scale

- [x] 1.1 Bump `.phase-label` font-size from 10px to 11px in `web/src/index.css`
- [x] 1.2 Bump `.skill-card` inner font-sizes: skill name from `text-xs` (12px) to 13px, description from `text-[10px]` to 11px in Sidebar.tsx inline styles
- [x] 1.3 Bump `.skill-tag` font-size from 9px to 10px in `web/src/index.css`
- [x] 1.4 Bump `.skill-action` font-size from 10px to 11px in `web/src/index.css`
- [x] 1.5 Bump `.market-banner` inner font-sizes: title from `text-xs` (12px) to 13px, description from `text-[10px]` to 11px, button from 11px to 12px in Sidebar.tsx
- [x] 1.6 Add disabled state styles for `.market-btn:disabled` in `web/src/index.css` (opacity 0.5, cursor not-allowed, muted border)
- [x] 1.7 Bump `.settings-select` font-size from 11px to 12px in `web/src/index.css`
- [x] 1.8 Bump `.settings-label` font-size from 12px to stay at 12px (no change — verify correctly applied)
- [x] 1.9 Bump `.settings-card` font-size from 11px to 12px in `web/src/index.css`
- [x] 1.10 Bump `.settings-danger-btn` font-size from 11px to 12px in `web/src/index.css`

## 2. Sidebar and panel typography

- [x] 2.1 Bump sidebar nav item icons from 14px to 15px (Sessions, MCP, Skills, Settings, all `size` props in JSX)
- [x] 2.2 Bump sidebar section labels ("Create", "Capabilities") from `text-[10px]` to `text-[11px]` and increase letter-spacing from `tracking-wider` to `tracking-widest` in Sidebar.tsx
- [x] 2.3 Bump panel title from `text-[13px]` to `font-size: 15px` in Sidebar.tsx detail header
- [x] 2.4 Bump session item names from `text-sm` (14px) to 14px serif (verify — may already be correct)
- [x] 2.5 Bump phase label from 10px to 11px, settings select labels from `text-xs` (12px) to stay at 12px (verify)
- [x] 2.6 Bump settings cache stat font-size from 16px (already 16px, verify) to remain 16px
- [x] 2.7 Bump message meta from `text-[10px]` to `text-[11px]` in relevant components

## 3. Resizable detail panel

- [x] 3.1 Import and call `useResizablePanel({ storageKey: "dscode-detail-panel-width", defaultWidth: 320, minWidth: 240, maxWidth: 480 })` in Sidebar.tsx for the detail panel
- [x] 3.2 Replace hardcoded `width: "280px", minWidth: "280px"` with dynamic `width` from the hook on the detail panel `<aside>`
- [x] 3.3 Add a resize handle element inside the detail panel `<aside>` (matching existing sidebar resize handle pattern)
- [x] 3.4 Spread `handleProps` from the hook onto the resize handle element
- [x] 3.5 Ensure the resize handle CSS class (`.resize-handle`) is present and styled (6px wide, col-resize cursor, accent hover)

## 4. Marketplace button

- [x] 4.1 Add `disabled` attribute to "Browse Marketplace" button in Sidebar.tsx
- [x] 4.2 Wrap button in a tooltip container showing "Coming soon — marketplace integration planned" on hover
- [x] 4.3 Add tooltip CSS styles (absolute positioning above button, dark background, white text, 11px font)

## 5. Verification

- [x] 5.1 `npm run typecheck` passes
- [x] 5.2 `npm run build` succeeds
- [x] 5.3 Visual check: open web UI, confirm typography matches prototype (compare side-by-side with `docs/prototypes/web-ui-editorial-workshop-scale-revision.html`)
- [x] 5.4 Visual check: drag detail panel resize handle, confirm width changes and persists across page reloads
- [x] 5.5 Visual check: hover marketplace button, confirm tooltip appears and button is non-interactive
