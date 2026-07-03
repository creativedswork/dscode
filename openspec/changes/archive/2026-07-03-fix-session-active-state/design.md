## Context

The sidebar `SessionsPanel` component already contains correct conditional logic to highlight the active session item — it sets `backgroundColor: "var(--color-accent-bg)"` when `isActive` is true. However, `--color-accent-bg` was never added to the CSS custom property definitions in `index.css`, so the browser receives an invalid value and renders a transparent background — identical to inactive rows.

## Goals / Non-Goals

**Goals:**
- Define `--color-accent-bg` in both light and dark themes so the active session row is visually distinct
- Ensure the token follows the existing warm-design-system conventions (semantic naming, both themes defined)

**Non-Goals:**
- No JS/TSX logic changes — the `SessionsPanel` already references the variable correctly
- No other UI redesigns

## Decisions

### Decision 1: Accent tint opacity levels

`--color-accent-bg` should be a low-opacity tint of `--color-accent` to provide subtle differentiation without overpowering the UI.

- **Light theme**: `rgba(202, 138, 4, 0.12)` — 12% opacity amber
- **Dark theme**: `rgba(212, 151, 8, 0.15)` — 15% opacity amber (slightly higher for dark backgrounds where contrast is naturally lower)

**Alternatives considered:**
- Reusing `--color-surface-hover` for active state → rejected because hover and active/selected are semantically distinct states and should have different visual treatments
- Hardcoding the color inline → rejected because it violates the design system's token-based approach and would not adapt to theme changes

### Decision 2: No additional active indicator for MVP

A left-border accent bar on the active row is a nice-to-have improvement but outside the scope of this bugfix. The background color alone will provide sufficient visual distinction.

## Risks / Trade-offs

- **Risk**: Users on high-contrast or extremely low-brightness displays may still find the 12-15% tint too subtle → **Mitigation**: The opacity levels were chosen to match common design system conventions; if feedback indicates insufficient contrast, values can be adjusted upward in a follow-up.
