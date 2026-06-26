## Design

### Approach: Visual disable (opacity + pointer-events)

Follows the established pattern from Sidebar `SessionsPanel` (line 190):

```
opacity: 0.4
pointer-events: none
```

No toast, no tooltip. The disabling itself is self-explanatory — dashboard mode clearly requires a session context.

### Component contract

```
ViewModeSwitcher
  Props:
    viewMode:    "chat" | "dashboard"     (unchanged)
    onChange:    (mode) => void           (unchanged)
    disabled?:   boolean                  (NEW — defaults to false)
```

When `disabled` is true:
- `<select>` gets `opacity: 0.4; pointer-events: none; cursor: not-allowed`
- The icon also dims to `opacity: 0.4` for visual consistency

### Defense in depth

Even though the `<select>` is pointer-events: none, `handleViewModeChange` still guards:

```typescript
if (mode === "dashboard" && !currentSessionIdRef.current) return;
```

This ensures no edge case (e.g., keyboard navigation around the disabled select, or programmatic calls) can trigger the switch.
