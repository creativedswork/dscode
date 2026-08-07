## Prototype Status

Prototype confirmed. v3 selected Variant D (ultra-compact). v5 identified the true root cause: CSS cascade layers prevent `@layer components` rules from overriding `@layer utilities` (Tailwind classes). The v3 scoped override never worked. Fix: (1) move `.tool-card-body-inner pre` to unlayered CSS, (2) move Markdown `<pre>` inline styles to `md-pre-base` class, (3) add `background: var(--color-bg)` to `.tool-card-body-inner`.

## Prototype Retention

The v3 and v4 variants were superseded during exploration. The v5 HTML was a
one-off bug reproduction whose durable findings are fully captured above and
in `design.md`; all three were deleted after implementation.
