## ADDED Requirements

### Requirement: useResizablePanel hook provides resize capability
The system SHALL provide a `useResizablePanel` hook at `web/src/hooks/useResizablePanel.ts`. The hook SHALL accept options `{ minWidth, maxWidth, defaultWidth, storageKey, enabled? }` and SHALL return `{ width, panelRef, handleProps }`.

#### Scenario: Hook initializes with saved width
- **WHEN** the hook mounts and localStorage contains a valid width for the given `storageKey`
- **THEN** `width` SHALL equal the stored value

#### Scenario: Hook initializes with default width
- **WHEN** the hook mounts and no value exists in localStorage for the given `storageKey`
- **THEN** `width` SHALL equal `defaultWidth`

#### Scenario: Hook is disabled
- **WHEN** `enabled` is `false`
- **THEN** `handleProps.onPointerDown` SHALL be a no-op that does not initiate drag

### Requirement: Drag resize via handleProps
When `handleProps.onPointerDown` is called, the hook SHALL initiate horizontal drag tracking. The panel width SHALL update in real-time following the pointer's horizontal movement. Width SHALL be clamped between `minWidth` and `maxWidth`.

#### Scenario: User drags to resize
- **WHEN** the user presses and drags the handle element right by 50px
- **THEN** `width` increases by 50px (clamped to maxWidth)
- **WHEN** the user drags left by 50px
- **THEN** `width` decreases by 50px (clamped to minWidth)

#### Scenario: Width clamped at bounds
- **WHEN** the user drags past minWidth or maxWidth
- **THEN** `width` stays at the boundary value

### Requirement: Drag UX management
During an active drag, the hook SHALL set `document.body.style.cursor` to `"col-resize"` and `document.body.style.userSelect` to `"none"`. On drag end, the hook SHALL restore body styles to their previous values.

#### Scenario: Body styles during drag
- **WHEN** a drag is in progress
- **THEN** the document body cursor is `col-resize`
- **THEN** text selection is suppressed (`user-select: none`)

#### Scenario: Body styles restored on drag end
- **WHEN** the drag ends (pointerup)
- **THEN** body cursor and user-select are restored to pre-drag values

### Requirement: Width persistence
On drag end, the hook SHALL write the final `width` to localStorage under the provided `storageKey`.

#### Scenario: Width saved on drag end
- **WHEN** the user finishes dragging to 400px with `storageKey: "dscode-sidebar-width"`
- **THEN** localStorage key `dscode-sidebar-width` contains `400`

### Requirement: Reusable CSS handle class
The system SHALL provide a `.resize-handle` CSS class in `web/src/index.css`. The class SHALL be: 4px wide, absolute-positioned at the right edge, `cursor: col-resize`, transparent by default, show `var(--color-border)` on hover, and `var(--color-accent)` on `:active`. It SHALL be hidden on screens < 768px via `@media`.

#### Scenario: Handle styling on desktop
- **WHEN** a `.resize-handle` element is rendered on viewport >= 768px
- **THEN** the handle is visible with `col-resize` cursor and reacts to hover/active

#### Scenario: Handle hidden on mobile
- **WHEN** viewport < 768px
- **THEN** `.resize-handle` is not visible

### Requirement: Sidebar consumes the hook
The Sidebar component SHALL use `useResizablePanel` to make itself resizable. It SHALL replace its fixed `w-80` class with a dynamic width from the hook. It SHALL render a `.resize-handle` element as the last child of the `<aside>`, spreading `handleProps`.

#### Scenario: Sidebar is resizable on desktop
- **WHEN** the sidebar renders on desktop
- **THEN** a `.resize-handle` element is present at the right edge
- **THEN** the sidebar width can be changed by dragging the handle

#### Scenario: Sidebar unchanged on mobile
- **WHEN** the viewport is < 768px
- **THEN** the sidebar retains its existing fixed overlay behavior
- **THEN** no resize handle is present
