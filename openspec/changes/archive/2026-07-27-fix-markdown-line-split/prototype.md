## Prototype Files

- `docs/prototypes/markdown-line-split-fix.html` — Side-by-side comparison of the broken and fixed Markdown rendering. Left panel shows the current `split('\n')` approach destroying code blocks, lists, and tables. Right panel shows the fix: single Markdown render with DOM post-processing to inject `data-collider` spans. Confirmed: `data-collider="text-line"` and `data-collider="code-line"` spans are injected without visual layout shift. Three view modes: side-by-side, broken-only, fixed-only. Debug toggle to visualize span outlines.
