# Layout patterns

Each pattern maps a *user intent* to a *structure*. Pick the one matching what the
user will do with the file, then style it with the shared design tokens.

---

## 1. Document (specs, plans, reports, explainers)

**Use for:** implementation plans, status/incident reports, feature/concept explainers,
PR write-ups, research summaries.

**Structure:**
- `header.page-head`: mono **eyebrow** → serif **H1** → optional `.prompt-box`
  echoing the request that generated the doc.
- **Summary strip**: `display: grid` of 3–4 key/value cells (`.k` mono label, `.v`
  big value, accent the most important). Gives a scannable TL;DR up top.
- **Numbered sections**: `.sec-head` = mono number chip (`--oat`) + serif H2, then a
  muted `.sec-intro` line, then content.

**Content blocks to mix in:** tables for tabular data; annotated code snippets;
inline SVG for data flow / architecture; callout boxes for gotchas/warnings; a
milestone timeline for plans.

**Pitfalls:** don't make it a wall of paragraphs — break into sections with visual
chrome; keep `max-width` ~820px for prose, wider for diagrams/tables.

---

## 2. Option grid (exploration / design comparison)

**Use for:** "generate N distinct approaches and lay them out side by side."

**Structure:** `display: grid; grid-template-columns: repeat(N, 1fr)` of cards. Each
card: title + the rendered option (mockup, code sketch, or design) + an explicit
**tradeoff label** ("optimizes for X, costs Y"). Collapse to 1–2 columns on mobile.

**Pitfalls:** every option must state its tradeoff — comparison is the whole point.
Make the options *genuinely distinct* (vary layout, tone, density), not cosmetic.

---

## 3. Annotated diff (code review / PR)

**Use for:** reviewing or explaining a PR.

**Structure:** render the actual diff in a `--mono` block. Color-code: added lines
green-tinted, removed red-tinted, context neutral. Put **margin annotations** beside
relevant lines and **severity-coded findings** (high/med/low) callouts. Add a header
with PR metadata (files changed, +/- counts).

**Pitfalls:** focus annotations on the area the reviewer flagged as unfamiliar; don't
annotate trivial lines. Escape `<`, `>`, `&` inside code blocks.

---

## 4. SVG diagram (flowcharts, architecture, technical illustration)

**Use for:** explaining how something works — token-bucket flow, state machines,
request lifecycles, system architecture.

**Structure:** hand-author `<svg>` with `<rect>`/`<circle>` nodes, `<path>`/`<line>`
edges (use `marker-end` arrowheads), and `<text>` labels. Use palette tokens for
fills/strokes. Pair the diagram with annotated code snippets and a gotchas section.

**Pitfalls:** set an explicit `viewBox` for crisp scaling; align labels to node
centers; keep stroke widths consistent. Don't fall back to ASCII art.

---

## 5. Slide deck

**Use for:** presentation-style output.

**Structure:** full-viewport `section.slide` elements (`height: 100vh`), a fixed
slide counter, and keyboard nav:

```js
let i = 0;
const slides = [...document.querySelectorAll('.slide')];
function go(n){ i = Math.max(0, Math.min(slides.length-1, n));
  slides[i].scrollIntoView({behavior:'smooth'}); }
addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') go(i+1);
  if (e.key === 'ArrowLeft')  go(i-1);
});
```

**Pitfalls:** one idea per slide; large type; don't overflow a viewport.

---

## 6. Editor (custom editing UI with export)

**Use for:** triage boards, feature-flag editors, prompt tuners, dataset curation,
annotation tools, value pickers (colors, easing, cron, regex).

**Structure:**
- A **toolbar** with the export button(s).
- The **interactive surface**: draggable cards / form inputs / sliders / side-by-side
  live preview, depending on the task.
- **Mandatory export**: a "Copy as JSON / Markdown / prompt / diff" button wired to
  the clipboard helper in `design-system.md`. This is what closes the loop — the user
  edits in the UI, then pastes the result back into Claude or commits it.

**Patterns by task:**
- Reorder/triage → draggable cards across columns (Now/Next/Later/Cut), export ordering + rationale.
- Edit config → grouped form fields, show dependencies, warn on invalid combos, export just the diff.
- Tune prompt/template → editable left pane, live-rendered samples on the right, token counter, copy.
- Curate dataset → approve/reject rows, export the selection.
- Pick painful values → live preview of color/easing/crop/cron/regex, copy the value.

**Pitfalls:** never ship an interactive file without an export — otherwise the user's
work is trapped in the page. Pre-populate with a sensible best-guess starting state.
