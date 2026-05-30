## 1. Hook — `useResizablePanel`

- [x] 1.1 Create `web/src/hooks/useResizablePanel.ts` with the hook signature: `({ minWidth, maxWidth, defaultWidth, storageKey, enabled }) => ({ width, panelRef, handleProps })`
- [x] 1.2 Implement width initialization: read from localStorage by `storageKey`, fallback to `defaultWidth`
- [x] 1.3 Implement drag state management: `useRef` for `{ startX, startWidth }`; `useState` for `width`
- [x] 1.4 Implement `onPointerDown`: capture pointer, record start position, attach `pointermove`/`pointerup` to `document`, set body `cursor: col-resize` + `user-select: none`
- [x] 1.5 Implement `pointermove` handler: compute `startWidth + (e.clientX - startX)`, clamp to `[minWidth, maxWidth]`, update `width` state
- [x] 1.6 Implement `pointerup` handler: remove document listeners, restore body styles, persist final width to localStorage
- [x] 1.7 Implement `enabled` guard: when `false`, `handleProps.onPointerDown` is a no-op
- [x] 1.8 Return `panelRef` (from `useRef<HTMLElement>`) and `handleProps` with `role: "separator"` and `aria-orientation: "vertical"`

## 2. CSS — `.resize-handle` class

- [x] 2.1 Add `.resize-handle` class to `web/src/index.css`: absolute positioned right-0 top-0 bottom-0, 4px width, `col-resize` cursor, z-index 10, transparent default, `var(--color-border)` on hover, `var(--color-accent)` on `:active`
- [x] 2.2 Add `@media (max-width: 767px)` rule: `.resize-handle { display: none; }`

## 3. Sidebar — consume the hook

- [x] 3.1 In `Sidebar.tsx`, import and call `useResizablePanel` with `{ storageKey: "dscode-sidebar-width" }`
- [x] 3.2 Replace the fixed `w-80` class with inline `style={{ width }}` from the hook
- [x] 3.3 Attach `panelRef` to the `<aside>` element
- [x] 3.4 Render a `<div className="resize-handle hidden md:block" {...handleProps} />` as the last child of `<aside>` (after the content div)
- [x] 3.5 Remove the `w-80` from the className string on the `<aside>`

## 4. Verify

- [x] 4.1 Manual smoke test on desktop: drag handle left/right, verify real-time resize, verify min 200px / max 500px clamp, verify persistence after page reload
- [x] 4.2 Verify mobile sidebar still works as before (no handle, fixed overlay, tap to open/close)
- [x] 4.3 Verify dark theme handle styling
- [x] 4.4 Verify that dragging does not trigger text selection
