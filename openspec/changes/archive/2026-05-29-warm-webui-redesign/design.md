## Context

The current web UI (`web/`) is a React + Tailwind CSS SPA communicating with the dscode backend via WebSocket. It uses a cold dark theme (`dscode-*` color tokens) closely mimicking GitHub's dark mode. The design is functional but impersonal — optimized for developer tool density rather than warm human-computer interaction.

The redesign is entirely visual: no WebSocket protocol changes, no new React component architecture, no data flow changes. Every change is scoped to Tailwind config, CSS, and component `className` + inline style adjustments.

**Constraint**: Must not break any existing functionality or WebSocket event handling. The App.tsx state machine and event handlers remain untouched except for class name changes.

**Skill-driven design**: This design synthesizes constraints from three loaded skills:
- `minimalist-ui`: Ultra-flat warm monochrome palette, `1px solid` borders as primary elevation cue, muted pastel accents, ban on heavy shadows/gradients/pill shapes/Inter font
- `design-taste-frontend`: Ban on cream/beige+brass AI-default palette, single-accent consistency lock, shape consistency lock, Geist Sans over Inter, no serif, full pre-flight checklist
- `imagegen-frontend-web`: Palette discipline, typography hierarchy, composition variety (conceptually applied to UI layout, not landing-page sections)

## Goals / Non-Goals

**Goals:**
- Replace the cold dark palette with a warm monochrome system using stone/taupe gray neutrals and a single amber accent — explicitly avoiding the cream/beige+brass AI tell
- Switch from Inter to Geist Sans for all UI text; retain JetBrains Mono for code only
- Flatten the component hierarchy: remove all shadows and gradients, use only `1px solid` borders as elevation cues
- Apply consistent border-radius: 12px for bubbles, 8px for cards/panels, 6px for buttons — no `rounded-full` (pill) shapes on large containers
- Add quiet, `prefers-reduced-motion`-aware CSS-only animations (fade-up entrance at 600ms, 200ms hover transitions)
- Replace hand-rolled inline SVG icons with a single icon library (Phosphor Icons)

**Non-Goals:**
- No WebSocket protocol changes
- No new npm dependencies beyond `@phosphor-icons/react`
- No component restructure or data model changes
- No responsive breakpoint changes
- No changes to the TUI (`src/ui/`)
- No serif fonts, no hand-rolled decorative SVGs, no emoji in UI

## Decisions

### D1: Warm stone/taupe gray neutrals with single amber accent — NOT cream/beige family

**Decision**: Use warm gray neutrals (`#f8f7f5` bg, `#f3f2ef` surface, `#e6e4e0` border, `#2d2a26` text) with a single muted amber/gold accent (`#ca8a04`). Dark mode: warm deep gray-browns (`#1e1c19` bg, `#282622` surface, `#3a3732` border, `#e8e4dd` text).

**Rationale**: The cream/beige + brass/oxblood palette is the #1 AI tell for "premium consumer" briefs per `design-taste-frontend` (§4.2 Premium-Consumer Palette Ban). Warmth doesn't require beige — warm-toned grays (slightly brown-tinted) achieve the same inviting feel without the AI template look. The single amber accent provides warmth at interaction points without flooding the canvas.

**Alternatives considered**:
- *Cream/beige + brass (original spec)*: Rejected per `design-taste-frontend` ban. Every AI-generated premium site uses this palette.
- *Cold Luxury (silver/chrome)*: Too cold for a "warm" brief.
- *Forest (deep green + bone)*: Interesting but green shifts the brand identity too far from "AI coding tool."
- *Pure monochrome with saturated accent*: Viable alternative but amber/gold carries more warmth than electric blue/emerald.

### D2: CSS custom properties for theming

**Decision**: Define color tokens as CSS custom properties on `:root` (light) and `.dark` (dark), then reference them as Tailwind `theme.extend.colors` entries. Theme toggle applies/removes `.dark` on `<html>`.

**Rationale**: Unchanged from original design. This is the cleanest approach for a two-theme system with smooth transitions (`transition: background-color 0.3s, color 0.3s`).

### D3: Geist Sans for UI, Geist Mono/JetBrains Mono for code — NO Inter, NO serif

**Decision**: Use Geist Sans as the primary UI font, Geist Mono (or JetBrains Mono) for code. Inter is explicitly banned as the default. No serif fonts are introduced.

**Rationale**: Both `minimalist-ui` (§3 Typographic Architecture) and `design-taste-frontend` (§4.1 Typography) ban Inter as the default reach — it's the most overused AI font. Geist Sans is cleaner, has better legibility at small sizes, and pairs naturally with Geist Mono. Serif is banned per `design-taste-frontend`'s strict constraints (only justified for editorial/luxury/publication brands — this is a dev tool).

**Alternatives considered**:
- *Inter (original spec)*: Banned by both skills as AI default.
- *Satoshi*: Good alternative, but Geist has better mono pairing.
- *Playfair Display / serif for headings*: Rejected per `design-taste-frontend` serif discipline.

### D4: Flat components — `1px solid` borders, no shadows, no gradients, no `rounded-full`

**Decision**: All component elevation uses `border: 1px solid var(--color-border)` as the sole visual separator. Zero box-shadows. Zero gradients. Consistent border-radius scale: 12px (bubbles), 8px (cards/panels/dialogs), 6px (buttons). No `rounded-full` on any large container or primary button.

**Rationale**: `minimalist-ui` is explicit: "DO NOT use Tailwind's default heavy drop shadows", "border-radius: 8px or 12px maximum", "DO NOT use `rounded-full` for large containers, cards, or primary buttons." This flat approach creates a calm, editorial feel that's distinct from both the current dark-terminal aesthetic and generic SaaS designs. The consistent radius scale reinforces visual order.

**Alternatives considered**:
- *Pill-shaped input (original spec)*: Rejected per `minimalist-ui` ban on `rounded-full`.
- *Subtle shadows*: Rejected per flat-component directive.

### D5: CSS keyframe animations, `prefers-reduced-motion`-aware

**Decision**: Define `@keyframes` for fade-up (opacity 0→1, translateY 12px→0, 600ms, cubic-bezier(0.16, 1, 0.3, 1)), hover transitions (200ms), and tool card expand (200ms). All gated behind `@media (prefers-reduced-motion: no-preference)`. No JS animation library.

**Rationale**: Unchanged core approach from original design, but tuned to `minimalist-ui`'s timing specs (600ms not 300ms for entrance, cubic-bezier curve). Motion must feel "invisible — present but never distracting."

### D6: Warm light as default

**Decision**: The initial theme is warm light. Dark mode available via toggle. Preference persisted to localStorage.

**Rationale**: Warm light best showcases the flat, clean aesthetic. Dark mode uses warm deep gray-browns (not cold blue-grays) to preserve warmth.

### D7: Phosphor Icons as single icon family

**Decision**: Add `@phosphor-icons/react` and replace all hand-rolled inline SVG paths with Phosphor Bold-weight icons. Consistent `strokeWidth` across all icons.

**Rationale**: `minimalist-ui` (§6) mandates Phosphor Icons (Bold or Fill) or Radix UI Icons for "a technical, slightly thicker-stroke aesthetic." `design-taste-frontend` (§3.C) lists Phosphor as first priority. The current code uses raw SVG paths in multiple components — these must be replaced.

## Risks / Trade-offs

- **[Risk] Warm dark mode could feel too warm**: Deep gray-browns might read as "sepia" rather than "dark mode." → **Mitigation**: Keep dark mode values deep enough (`#1e1c19` is near-black) to clearly read as dark, while the brown undertone is subtle.
- **[Risk] Flat design feels unfinished**: Zero shadows could make the UI feel like a wireframe. → **Mitigation**: The `1px solid` borders provide real structure. Generous whitespace prevents flatness from becoming muddiness. This is a tested aesthetic (Linear, Notion, early Stripe).
- **[Risk] Geist Sans not available on all systems**: Geist is a relatively new font. → **Mitigation**: Self-host via `@font-face` or use next/font. System sans-serif fallback chain ensures no layout break.
- **[Trade-off] Phosphor Icons adds ~200KB to bundle**: The current hand-rolled SVGs are effectively free. → **Acceptable**: Tree-shaking ensures only used icons ship. The visual consistency gain outweighs the bundle cost.
- **[Trade-off] Less color variety**: Single-accent means no blue links, green success, red errors in vivid form. → **Acceptable**: Muted pastel backgrounds (pale green/red) provide sufficient semantic distinction without breaking the monochrome envelope.
