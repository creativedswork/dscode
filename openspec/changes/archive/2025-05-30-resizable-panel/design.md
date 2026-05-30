## Context

The sidebar currently uses a fixed Tailwind class `w-80` (320px). The layout is: `flex row` → `<Sidebar>` + `<main>`. The sidebar has no resize mechanism. Looking forward, the UI may grow additional panels (details panel, file browser, etc.), and each would need resizability. Rather than duplicate drag logic per panel, we need a reusable primitive.

The existing hook pattern in this project (`web/src/hooks/useWebSocket.ts`) is minimal and straightforward — pure logic hooks without JSX.

## Goals / Non-Goals

**Goals:**
- Create a reusable `useResizablePanel` hook that any horizontal panel can consume
- Hook encapsulates: pointer drag tracking, width clamping, localStorage persistence, body cursor/user-select management during drag
- Sidebar consumes the hook and gains resize capability
- Handle styling is generic (`.resize-handle` class), not sidebar-specific
- Works on desktop only; mobile panels continue fixed-width behavior

**Non-Goals:**
- Vertical resize (vertical panels)
- Nested resizable panels
- Panel collapse/expand
- Keyboard-accessible resize
- Resize from left edge (only right-edge resizing for horizontal panels)

## Decisions

### 1. Architecture: Custom hook, not a wrapper component

A `useResizablePanel` hook that returns `{ width, panelRef, handleProps }` gives the consumer full control over rendering while encapsulating all drag logic. A wrapper component (`<ResizablePanel>`) would be more opinionated about DOM structure and harder to compose with existing sidebar markup.

**Why hook over component:** The sidebar already has complex conditional classes (`fixed md:static`, translate transforms for mobile). Wrapping it in a `<ResizablePanel>` would require forwarding all those concerns through props or render props. A hook lets the sidebar own its rendering.

### 2. Hook API

```typescript
function useResizablePanel(options: {
  minWidth: number;       // default 200
  maxWidth: number;       // default 500
  defaultWidth: number;   // default 320
  storageKey: string;     // localStorage key
  enabled?: boolean;      // default true — set false for mobile
}): {
  width: number;
  panelRef: RefObject<HTMLElement>;
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    role: "separator";
    "aria-orientation": "vertical";
  };
}
```

The consumer attaches `panelRef` to the panel element and spreads `handleProps` onto the handle element.

### 3. Drag mechanics (same as before, but inside the hook)

- `onPointerDown`: capture pointer, record startX/startWidth in a ref, attach `document`-level `pointermove`/`pointerup`
- `pointermove`: compute `startWidth + (e.clientX - startX)`, clamp, set width state
- `pointerup`: remove listeners, restore body styles, persist to localStorage
- Body styles during drag: `cursor: col-resize` + `user-select: none`

### 4. Handle rendering: consumer responsibility

The hook returns `handleProps` but does NOT render the handle element. The consumer renders:

```tsx
<div ref={panelRef} style={{ width }}>
  {/* panel content */}
  <div className="resize-handle hidden md:block" {...handleProps} />
</div>
```

This keeps the hook zero-JSX and maximally flexible.

### 5. CSS: Generic `.resize-handle` class

In `index.css`:
```css
.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
  transition: background-color 0.15s ease;
}
.resize-handle:hover {
  background-color: var(--color-border);
}
.resize-handle:active {
  background-color: var(--color-accent);
}
```

The `hidden md:block` Tailwind classes hide it on mobile.

### 6. Sidebar integration

```tsx
const { width, panelRef, handleProps } = useResizablePanel({
  minWidth: 200,
  maxWidth: 500,
  defaultWidth: 320,
  storageKey: "dscode-sidebar-width",
});

// Replace w-80 with dynamic width
<aside ref={panelRef} style={{ width }}>
  ...
  <div className="resize-handle hidden md:block" {...handleProps} />
</aside>
```

The sidebar's `w-80` class is removed in favor of the inline `style={{ width }}`.

## Risks / Trade-offs

- **Hook returns a ref to attach**: The consumer must remember to attach `panelRef`. If forgotten, width changes but the panel doesn't resize visually. → Mitigation: this is a standard React pattern; the sidebar is the only consumer for now, easy to verify.
- **localStorage key collision**: If two panels use the same key, they'll fight over width. → Mitigation: each consumer provides its own key; document in JSDoc.
- **`panelRef` is a plain `RefObject` not a callback ref**: Won't work if the consumer needs its own ref on the same element. → Mitigation: for now sidebar doesn't use its own ref. If needed later, we can add `useMergeRefs` or accept an external ref as an option.
