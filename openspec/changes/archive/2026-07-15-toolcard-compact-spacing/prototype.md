## Prototype Files

- `docs/prototypes/builtin-tool-result-rendering-fix-v3.html` — 4-variant spacing comparison. **Confirmed: Variant D (Ultra-compact, no border-top)** — selected as the design direction.
- `docs/prototypes/builtin-tool-result-rendering-fix-v4.html` — Intermediate analysis (background + inline styles). Superseded by v5.
- `docs/prototypes/builtin-tool-result-rendering-fix-v5.html` — **True root cause: CSS cascade layers.** Shows that `.tool-card-body-inner pre` is in `@layer components` while Tailwind's `.p-3` and `.my-1` are in `@layer utilities`. Utilities always beats components regardless of specificity — the scoped override never worked. `<pre>` retains 12px padding + 4px margin. Also explains why built-in tools (code fence → `<pre>` with p-3+my-1 = 16px gap) are affected but MCP tools (plain text → `<p>` with 0 margin = 0px gap) are not. Fix: move override to unlayered CSS + move `<pre>` inline styles to CSS class.

## Prototype Status

Prototype confirmed. v3 selected Variant D (ultra-compact). v5 identified the true root cause: CSS cascade layers prevent `@layer components` rules from overriding `@layer utilities` (Tailwind classes). The v3 scoped override never worked. Fix: (1) move `.tool-card-body-inner pre` to unlayered CSS, (2) move Markdown `<pre>` inline styles to `md-pre-base` class, (3) add `background: var(--color-bg)` to `.tool-card-body-inner`.
