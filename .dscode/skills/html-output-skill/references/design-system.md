# Design system

Every file shares one design system so a collection of HTML outputs feels like a
single product. Copy the `:root` block below **verbatim** into the `<style>` of each
file. Do not invent a new palette per file.

## Token block (paste into every `:root`)

```css
:root {
  /* palette — Anthropic-style warm neutrals + clay accent */
  --ivory:    #FAF9F5;  /* page background */
  --slate:    #141413;  /* headings / ink */
  --clay:     #D97757;  /* primary accent */
  --clay-d:   #B85C3E;  /* accent hover/active */
  --oat:      #E3DACC;  /* chips / soft fills */
  --olive:    #788C5D;  /* success / positive */
  --gray-150: #F0EEE6;  /* subtle surface */
  --gray-300: #D1CFC5;  /* borders */
  --gray-500: #87867F;  /* muted text */
  --gray-700: #3D3D3A;  /* body text */
  --white:    #FFFFFF;

  /* type — serif headings, sans body, mono for labels/code */
  --serif: ui-serif, Georgia, 'Times New Roman', serif;
  --sans:  system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --mono:  ui-monospace, 'SF Mono', Menlo, Monaco, monospace;
}
```

## Usage conventions

- **Background / ink**: `body { background: var(--ivory); color: var(--gray-700); }`.
- **Headings** use `--serif`, weight 500, `letter-spacing: -0.01em`, color `--slate`.
  H1 ~30–38px, H2 ~26px.
- **Body** uses `--sans`, `line-height: 1.5–1.55`, ~14–15px.
- **Labels / eyebrows / code / numbers** use `--mono`, 11–12px, uppercase,
  `letter-spacing: 0.06–0.08em`, color `--gray-500`.
- **Accent** `--clay` for primary buttons, key figures, active states; `--clay-d` on hover.
- **Cards / surfaces**: `--white` or `--gray-150` fill, `1.5px solid var(--gray-300)`
  border, `border-radius: 12px`, padding ~16–20px.
- **Chips / section numbers**: `--oat` background, `--slate` text, small radius.
- **Semantic colors**: `--olive` positive; derive a muted red/amber for warnings.

## Required boilerplate

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>...</title>
  <style>
    :root { /* token block above */ }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--sans);
      background: var(--ivory);
      color: var(--gray-700);
      line-height: 1.55;
      padding: 56px 32px 120px;
      -webkit-font-smoothing: antialiased;
    }
    .page { max-width: 1120px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="page">...</div>
</body>
</html>
```

Always include `<meta name="viewport">` so the file is mobile responsive, and use
`@media (max-width: 900px)` to collapse multi-column grids to fewer columns.

## Clipboard export helper (for interactive files)

Every editor/tuner must export. This helper works even from `file://` where the
async Clipboard API may be blocked:

```js
function writeClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // fallback for file:// contexts without clipboard permission
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) { /* ignore */ }
  document.body.removeChild(ta);
  return Promise.resolve();
}

function flash(btn, msg) {
  const orig = btn.textContent;
  btn.textContent = msg;
  btn.classList.add("copied");
  setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 1200);
}

copyBtn.addEventListener("click", () => {
  writeClipboard(buildExport()).then(() => flash(copyBtn, "Copied ✓"));
});
```
