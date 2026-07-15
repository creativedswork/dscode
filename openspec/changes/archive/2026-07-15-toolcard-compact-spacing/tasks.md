## 1. CSS — `.tool-card-body-inner` compact spacing (v3, done)

- [x] 1.1 In `web/src/index.css`, modify `.tool-card-body-inner`: remove `border-top`, remove `margin-top: 2px`, change padding to `padding: 2px 14px 6px`
- [x] 1.2 Add scoped `.tool-card-body-inner pre` rule inside `@layer components` (note: this NEVER worked due to cascade layers — fixed in task 4)
- [x] 1.3 Add CSS comment about specificity (note: incorrect — the real issue is cascade layers, not specificity)

## 2. CSS — `.mcp-raw-block` compact spacing (v3, done)

- [x] 2.1 In `web/src/index.css`, modify `.mcp-raw-block`: remove `border-top`, change padding to `padding: 2px 14px 6px`

## 3. CSS — `.mcp-rich-list` consistency (v3, done)

- [x] 3.1 In `web/src/index.css`, modify `.mcp-rich-list`: remove `border-top` for consistency

## 4. Root cause fix — cascade layers + inline styles + background (v5)

- [x] 4.1 In `web/src/index.css`, **move** the `.tool-card-body-inner pre` rule **out of `@layer components`** to the unlayered section (after the closing `}` of `@layer components`). This is the critical fix — unlayered CSS beats `@layer utilities`, so `padding: 6px 10px` and `margin: 0` will finally override Tailwind's `p-3` (12px) and `my-1` (4px). Update the CSS comment to explain cascade layers, not specificity.
- [x] 4.2 In `web/src/components/Markdown.tsx`, replace `<pre>` inline `style={{ borderRadius, backgroundColor, border, color }}` with `className="md-pre-base ..."` — inline styles prevent CSS from overriding `border` and `border-radius`
- [x] 4.3 In `web/src/index.css` (unlayered section), add `.md-pre-base` class with exact same values as previous inline styles: `border-radius: 8px; background-color: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text)` — ensures zero visual regression for chat messages and other contexts
- [x] 4.4 In `web/src/index.css` (unlayered section), update scoped override to `.tool-card-body-inner .md-pre-base` with `padding: 6px 10px; margin: 0; border: none; border-radius: 4px` — now ALL properties take effect (unlayered + class-based, no inline style conflict)
- [x] 4.5 In `web/src/index.css`, add `background: var(--color-bg)` to `.tool-card-body-inner` — eliminates color contrast gap, matching `.mcp-raw-block`

## 5. Verification

- [x] 5.1 Run `npm run typecheck` to ensure no compilation errors
- [x] 5.2 Run `npm run build` to verify the web frontend builds successfully
- [ ] 5.3 Visual check: trigger a built-in tool (e.g., `bash`, `list_files`), expand the ToolCard — confirm `<pre>` has 6px padding (not 12px), 0 margin (not 4px), no border, and total header→content gap is ~8px
- [ ] 5.4 Visual check: built-in tool ToolCard should now visually match MCP tool ToolCard tightness
- [ ] 5.5 Visual check: confirm chat message `<pre>` blocks (outside ToolCard) are unaffected — still have `1px solid` border, `8px` border-radius, `12px` padding, and `--color-bg` background (via `.md-pre-base` base class + Tailwind `p-3`)
- [ ] 5.6 Visual check: trigger an MCP tool with non-JSON result, confirm `.mcp-raw-block` still looks correct
