## Why

The ToolCard component has a visually excessive gap (~19px) between the header and the result content for built-in tools. MCP tools do not have this problem (~2px gap). 

**True root cause:** The scoped CSS rule `.tool-card-body-inner pre { padding: 6px 10px; margin: 0 }` is inside `@layer components` in `index.css`. But the Markdown component's `<pre>` uses Tailwind classes `p-3` (12px padding) and `my-1` (4px margin), which live in `@layer utilities`. CSS cascade layers dictate that `@layer utilities` always beats `@layer components` regardless of specificity — so the override never worked. The `<pre>` retains 12px padding + 4px margin.

**Why built-in tools are affected but MCP tools are not:** Built-in tool results (`bash`, `read_file`, `grep`, `glob`) are wrapped in markdown code fences by `formatToolResultForUI`, rendering as `<pre>` elements with `p-3` + `my-1` = 16px of padding/margin. MCP tool results are typically plain text, rendering as `<p>` elements with 0 margin (Tailwind preflight reset) = 0px gap.

Additionally, the Markdown `<pre>` uses inline styles for `border`, `borderRadius`, and `backgroundColor`, which CSS selectors cannot override even with correct layering. And `.tool-card-body-inner` lacks `background: var(--color-bg)` which `.mcp-raw-block` has.

The v5 prototype (`builtin-tool-result-rendering-fix-v5.html`) documents the true root cause and fix.

## What Changes

- Move `.tool-card-body-inner pre` (and `.mcp-raw-block pre`) CSS rules **out of `@layer components`** to unlayered CSS — unlayered CSS beats all `@layer` rules, so `padding: 6px 10px` and `margin: 0` will actually override Tailwind's `p-3` and `my-1`
- Move Markdown component `<pre>` inline styles (`border`, `borderRadius`, `backgroundColor`, `color`) to a CSS class `md-pre-base` — makes `border: none` and `border-radius: 4px` overridable via scoped CSS
- Add `background: var(--color-bg)` to `.tool-card-body-inner` — matches `.mcp-raw-block`, eliminates color contrast gap
- The base `md-pre-base` class preserves identical appearance for all non-ToolCard contexts (chat messages, artifacts, etc.)

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `tool-result-content-rendering`: The ToolCard visual spacing requirements change — `.tool-card-body-inner` SHALL have `background: var(--color-bg)` and scoped `<pre>` overrides SHALL be in unlayered CSS (not `@layer components`) so they can override Tailwind utilities. The Markdown `<pre>` SHALL use CSS classes (not inline styles) for `border`, `border-radius`, `background-color`, and `color`.

## Impact

- **CSS**: `web/src/index.css` — move `.tool-card-body-inner pre` out of `@layer components` to unlayered section; add `background: var(--color-bg)` to `.tool-card-body-inner`; add `.md-pre-base` class
- **Component**: `web/src/components/Markdown.tsx` — replace `<pre>` inline `style={{}}` with `className="md-pre-base ..."`
- **Prototype**: `docs/prototypes/builtin-tool-result-rendering-fix-v5.html` — true root cause analysis and fix visualization
- **No breaking changes** — `md-pre-base` class produces identical appearance to previous inline styles for all existing contexts; unlayered CSS only affects ToolCard-scoped selectors
