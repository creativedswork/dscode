## Context

Current MCP App flow requires Server to provide `mcp-app.html` via `resources/read`. dscode's `AppHostManager` fetches it, registers an app, and serves it through a sandbox proxy. This works but forces every Server developer to write HTML — even for simple data-display tools.

The proposal introduces a browser-side MDX Runtime that auto-generates UIs from `structuredContent`, eliminating the Server HTML requirement. Server can still provide HTML (backward compatible) or opt into auto-layout with optional MDX overrides.

## Goals / Non-Goals

**Goals:**
1. Auto-generate interactive UIs from `structuredContent` without Server-provided HTML
2. Ship a lightweight MDX Runtime (Chart, Metrics, Table, Slider, Card, Row) in the sandbox
3. Support Server-provided MDX overrides (`_ui.mdx`) for custom layouts
4. Backward compatible — existing `mcp-app.html` Servers continue working
5. example `scenario-modeler` works with zero HTML

**Non-Goals:**
- No React/Vue/JS framework dependency
- No LLM involvement in UI generation (deterministic, fast)
- No build step for the MDX Runtime (plain JS, concatenated into sandbox)
- No drag-and-drop or WYSIWYG editing
- Not replacing the sandbox architecture (postMessage ↔ bridge remains)

## Decisions

### 1. MDX Runtime: Hand-written parser, not React MDX

**Choice**: Write a ~200-line tag parser that recognizes `<Chart/>`, `<Metrics/>`, etc., with inline JSON data binding. No JSX compilation.

```
Input:  `<Chart type="line" data={projections} x="month" y={["mrr","netProfit"]}/>`
Parser:  match <Chart ... /> → extract props → resolve data bindings
Output:  Canvas element with bound data
```

**Alternative**: Full MDX/React compiler (esbuild + MDX plugin). Too heavy for a single-file sandbox runtime.

**Rationale**: The component surface is tiny (6 components), data is pre-loaded JSON, event model is minimal. A simple regex-based parser suffices.

### 2. MDX Runtime delivery: Injected into sandbox.html

**Choice**: Bundle the MDX Runtime (parser + 6 components) as a single JS string, inject into `sandbox.html` at serve time. The sandbox page detects data mode vs HTML mode.

```
sandbox.html (template with injection point)
  ├── <style> ... </style>
  ├── <script>/* MDX_RUNTIME_PLACEHOLDER */</script>  ← injected at serve time
  └── <script>
        if (dataMode) {
          parseMDX(layout, data);
          renderComponents();
        } else {
          // legacy: injectApp() with srcdoc
        }
      </script>
```

**Alternative**: Serve MDX Runtime as a separate .js file. Adds a network request, CSP complexity.

**Rationale**: Single HTML response, zero extra requests. CSP stays simple (`connect-src 'self'`). Works when the page is a static file too (dev mode).

### 3. Auto-layout inference: heuristic rules

**Choice**: Inspect `structuredContent` shape and apply priority-ordered rules:

```
Rule 1: { x: number[], y: number[] } or array of { label, value } → Metrics cards
Rule 2: Array of objects with numeric fields → Table
Rule 3: Array of objects where one field is sequential (month, date) and others numeric → Chart + Table
Rule 4: Object with nested arrays and numeric summaries → Chart + Metrics + Table combo
Rule 5: Flat key-value → Cards
```

**Alternative**: Machine learning model. Overkill, unpredictable, no training data.

**Rationale**: 80% of tool results fall into these patterns. Simple heuristics cover the common cases.

### 4. Server MDX override: `_ui.mdx` in structuredContent

**Choice**: If `structuredContent._ui.mdx` is a string, use it as the layout. Data bindings reference sibling keys in `structuredContent`.

```json
{
  "structuredContent": {
    "templates": [...],
    "projections": [...],
    "summary": {...},
    "_ui": {
      "mdx": "<Metrics data={summary}/>\n<Chart data={projections} x=\"month\" y={[\"mrr\",\"netProfit\"]}/>",
      "bindings": {}
    }
  }
}
```

**Alternative**: Namespace the data under a `data` key. But current tools return data at the top level.

**Rationale**: Minimal Server-side change — just add a string. No new protocol fields needed (SDK doesn't need updating).

### 5. Backward compatibility: Phase detection

**Choice**: `checkAndRegisterApp` detects whether the tool has a UI resource:

```
if (resourceUri) {
  fetchUiResource(html) → legacy mode (srcdoc)
} else if (result.structuredContent) {
  generateMDXLayout(data) → data mode (MDX Runtime)
} else {
  skip (text-only result)
}
```

**Rationale**: No breaking change. Existing Servers with `s.resource()` continue working. New Servers just omit the resource and get auto-layout.

### 6. Component Canvas: Canvas 2D (same as current)

**Choice**: Chart component uses Canvas 2D API, same approach as current `mcp-app.html`.

**Alternative**: SVG. More DOM elements, harder to animate, no real advantage for simple line/bar charts.

**Rationale**: Proven, already works in sandbox, zero dependencies.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Auto-layout produces wrong chart type | Server can override with `_ui.mdx` |
| MDX parser too simple for edge cases | Component surface is tiny; escape to raw HTML is always available |
| Runtime JS bundle increases page size | MDX Runtime is ~15KB uncompressed (~5KB gzipped), acceptable for a single-page tool |
| Inference heuristics miss important data patterns | Add rules incrementally; scope to common SaaS/data patterns first |

## Open Questions

- Should the MDX Runtime support `<Form/>` for input-bound tools? (defer to future change)
- Should we support themes (light/dark)? (yes, reuse sandbox CSS variables)
