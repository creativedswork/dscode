## Context

The editorial workshop redesign (web-ui-editorial-workshop, complete, 51/51 tasks) established the current app shell: 38px topbar, 220px sidebar with expandable 280px detail panels, and an editorial typographic system. The design philosophy was "dramatic typographic scale" — tiny chrome (10px labels) contrasting with large content moments (28px empty state titles). Post-launch, users reported the chrome is too small for comfortable daily use, the 280px detail panel is too narrow for rich content like MCP tool lists, and the panel cannot be resized despite the main sidebar supporting resize via a generic `useResizablePanel` hook.

The prototype `docs/prototypes/web-ui-editorial-workshop-scale-revision.html` demonstrates the proposed changes side-by-side.

## Goals / Non-Goals

**Goals:**
- Increase all UI chrome type sizes by 1-2px, preserving the editorial contrast hierarchy
- Apply the existing `useResizablePanel` hook to the detail panel with default 320px, range 240-480px
- Persist detail panel width to localStorage with key `dscode-detail-panel-width`
- Disable the "Browse Marketplace" button with a tooltip indicating the feature is coming
- Bump sidebar icon sizes from 14px to 15px to match the broader scale adjustment
- Fix panel title from 13px to the originally-specified 15px

**Non-Goals:**
- No changes to the `useResizablePanel` hook itself (it is already generic, tested, and shared)
- No backend changes
- No new npm dependencies
- No responsive breakpoint changes
- No changes to the empty state or message content typography (28px title, 15px user message, 13px thinking text remain as-is)

## Decisions

### D1: Typographic scale bump — shift everything up 1-2px

**Decision**: Bump all UI chrome type sizes by 1-2px. The scale becomes:

| Element | Current | Proposed | Rationale |
|---------|---------|----------|-----------|
| Section labels | 10px | 11px | Slightly more legible, still subordinate |
| Panel titles | 13px | 15px | Matches original spec (D9: "15px serif") |
| Nav items | 14px | 14px | Unchanged — already readable at this size |
| Skill names | 12px | 13px | Better hierarchy within cards |
| Skill descriptions | 10px | 11px | Improved readability for longer text |
| Tags | 9px | 10px | Still the smallest element, but not illegible |
| Buttons (small) | 10px | 11px | Better touch target readability |
| Buttons (medium) | 11px | 12px | Consistent with nav items |
| Phase labels | 10px | 11px | Better scanability during long turns |
| Message meta | 10px | 11px | More readable timestamps |
| Badges | 10px | 10px | Unchanged — badges are decorative |
| Settings selects | 11px | 12px | Better form readability |
| Cache stat | 14px | 16px | More impact for the cache size display |
| Sidebar icons | 14px | 15px | Matches panel title bump |

**Rationale**: The editorial workshop deliberately used small chrome to create dramatic contrast. The contrast still works at 11-15px (vs. 28px empty state) — the shift is subtle enough that the editorial character is preserved, but large enough to make daily use comfortable. This is a refinement, not a redesign.

**Alternatives considered**:
- *Bump by 3-4px*: Rejected — would lose the editorial identity, making it look like a generic SaaS dashboard.
- *Only bump panel titles*: Rejected — inconsistent; a single increased element makes others feel even smaller by comparison.
- *Do nothing*: Rejected — user feedback is clear that the current scale is too aggressive.

### D2: Detail panel resizable via useResizablePanel hook

**Decision**: Apply `useResizablePanel({ minWidth: 240, maxWidth: 480, defaultWidth: 320, storageKey: "dscode-detail-panel-width" })` to the detail panel `<aside>` element. Add a resize handle on the detail panel's right edge (matching the existing sidebar resize handle pattern).

**Rationale**: The hook already exists, is well-tested on the sidebar, and is designed to be generic. The only change is calling it with different parameters for the detail panel. This is ~5 lines of code. The detail panel's content (MCP tool lists, skill cards, settings forms) benefits significantly from more horizontal space.

**Alternatives considered**:
- *New dedicated hook*: Rejected — `useResizablePanel` is already generic enough. No reason to duplicate.
- *Fixed wider panel (e.g., 350px)*: Rejected — one-size-fits-all doesn't work; MCP needs ~300px for tool names, settings needs ~280px. Letting users adjust is better than guessing.

### D3: Marketplace button — disabled with tooltip

**Decision**: Add `disabled` attribute and a CSS tooltip ("Coming soon — marketplace integration planned") to the "Browse Marketplace" button. The button remains visible (fulfilling its role as a design placeholder for future marketplace feature) but communicates its non-functional state.

**Rationale**: The design spec explicitly calls the marketplace "UI-only placeholder — no backend marketplace integration." Currently the button has no `onClick` handler at all — it renders but does nothing, which is confusing. Disabling it with a tooltip is the minimal change that resolves the confusion without removing the placeholder.

**Alternatives considered**:
- *Hide the button entirely*: Rejected — the marketplace banner is part of the design language and signals future capability.
- *Wire it to open a URL*: Rejected — no marketplace exists yet; premature wiring creates false expectations.
- *Leave as-is*: Rejected — an inert button that looks clickable is frustrating UX.

### D4: Panel title fix — 13→15px

**Decision**: Fix the panel title from `text-[13px]` to `font-size: 15px` to match the original spec (D9 in web-ui-editorial-workshop design.md: "panel header titles (15px)").

**Rationale**: This was a bug in the original implementation. The spec explicitly required 15px. The code shipped at 13px.

## Risks / Trade-offs

- **[Risk] Scale bump changes visual density**: More text at larger sizes means slightly more scrolling in long panels. → **Mitigation**: The bump is 1-2px — minimal impact on vertical density. Panel content is not content-heavy (settings ~6 fields, skills ~7 cards).
- **[Risk] Detail panel resize conflicts with sidebar resize**: Two adjacent resizable panels could create confusing drag targets. → **Mitigation**: The sidebar resize handle is on the sidebar's right edge; the detail panel resize handle is on the detail panel's right edge. They are at least 280px apart. The cursor is `col-resize` for both, which is the standard convention.
- **[Trade-off] Detail panel default 320px vs original 280px**: This takes 40px more horizontal space from the main content area. → **Acceptable**: On a 1440px screen with sidebar (220px) + detail panel (320px) + 48px padding, the main content area is ~850px. With the original 280px, it was ~890px. The 40px difference is negligible for chat readability.
