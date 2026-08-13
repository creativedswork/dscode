## Context

The ToolCard component renders tool call results in the web UI. The v3 changes (reduced padding, removed `border-top`, scoped `<pre>` CSS override) were applied but built-in tools still show a ~19px gap between header and content, while MCP tools show ~2px.

**True root cause** (confirmed during the visual debugging iteration):

The scoped CSS rule `.tool-card-body-inner pre { padding: 6px 10px; margin: 0 }` lives inside `@layer components` in `index.css` (lines 102-547). The Markdown component's `<pre>` uses Tailwind classes `p-3` (12px) and `my-1` (4px), which live in `@layer utilities`. **CSS cascade layers dictate that `@layer utilities` always beats `@layer components`, regardless of specificity.** The override never worked — `<pre>` retains 12px padding + 4px margin.

**Why built-in tools are affected but MCP tools are not:** `formatToolResultForUI` wraps built-in tool results (`bash`, `read_file`, `grep`, `glob`) in markdown code fences, rendering as `<pre>` with `p-3` + `my-1` = 16px gap. MCP tool results are typically plain text, rendering as `<p>` with 0 margin (Tailwind preflight) = 0px gap.

Two additional issues compound the problem:
1. The Markdown `<pre>` uses inline styles (`border`, `borderRadius`, `backgroundColor`) that CSS cannot override even with correct layering.
2. `.tool-card-body-inner` lacks `background: var(--color-bg)` which `.mcp-raw-block` has.

## Goals / Non-Goals

**Goals:**
- Make the scoped `<pre>` override actually work by moving it out of `@layer components` to unlayered CSS
- Move Markdown `<pre>` inline styles to a CSS class so `border` and `border-radius` are also overridable
- Add `background: var(--color-bg)` to `.tool-card-body-inner` for visual consistency with `.mcp-raw-block`
- Reduce built-in tool ToolCard gap from ~19px to ~8px, matching MCP tool tightness

**Non-Goals:**
- Changing ToolCard header padding or layout
- Changing the exec-card (in-progress MCP tool) spacing
- Changing the progress bar container spacing
- Changing `<pre>` styling in chat messages or other non-ToolCard contexts

## Decisions

### Decision 1: Move scoped `<pre>` override out of `@layer components` to unlayered CSS

**Choice:** Remove the `.tool-card-body-inner pre` rule from the `@layer components` block. Place it in the unlayered section of `index.css` (after the `@layer components` closing brace).

**Rationale:** Unlayered CSS beats all `@layer` rules regardless of specificity. This is the only way to override Tailwind utility classes (`p-3`, `my-1`) that live in `@layer utilities` without using `!important`. Moving just the ToolCard-scoped rule out of the layer has no effect on other components.

**Alternative considered:** Use `!important` on the scoped CSS properties. Rejected — maintenance hazard, makes future changes harder to reason about. Also considered: putting the rule in `@layer utilities`. Rejected — while this would work, it mixes component-specific overrides with generic utilities, reducing clarity.

### Decision 2: Move Markdown `<pre>` inline styles to CSS class `md-pre-base`

**Choice:** In `web/src/components/Markdown.tsx`, replace `style={{ borderRadius, backgroundColor, border, color }}` on `<pre>` with `className="md-pre-base ..."`. Add `.md-pre-base` to unlayered CSS with identical values. Use `.tool-card-body-inner .md-pre-base` for scoped overrides.

**Rationale:** Inline styles have specificity (1,0,0,0) which beats any CSS selector. Moving to a class makes `border`, `border-radius`, `background-color` overridable. The base class preserves identical appearance for all existing contexts.

### Decision 3: Add `background: var(--color-bg)` to `.tool-card-body-inner`

**Choice:** Add `background: var(--color-bg)` to `.tool-card-body-inner`, matching `.mcp-raw-block`.

**Rationale:** Eliminates the color contrast between container padding (`--color-surface`) and `<pre>` background (`--color-bg`). This is a secondary fix — the primary gap reduction comes from Decision 1.

## Risks / Trade-offs

- **[Unlayered CSS overrides all layers]** → The unlayered `.tool-card-body-inner pre` rule will override any Tailwind utility on `<pre>` inside ToolCard. This is intentional and scoped — only affects `<pre>` elements inside `.tool-card-body-inner`. Mitigation: the selector is specific enough to not affect other contexts.
- **[Markdown `<pre>` class change affects all contexts]** → The base class `md-pre-base` must produce identical appearance to current inline styles. Mitigation: copy exact values into the class. Add visual regression check for chat message code blocks.
- **[CSS class name collision]** → `md-pre-base` is a custom class, unlikely to collide with Tailwind utilities. Mitigation: use a distinctive prefix.
