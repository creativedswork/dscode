## Why

Currently MCP App Views require MCP Server developers to hand-write a complete HTML file (`mcp-app.html`) for each tool. This creates unnecessary friction: a simple data-returning tool needs a whole frontend page just to display results. dscode should dynamically generate interactive UIs from tool result data, eliminating the need for Server-provided HTML in the common case.

## What Changes

- **Built-in MDX renderer**: dscode ships a lightweight MDX runtime component system (`<Chart/>`, `<Metrics/>`, `<Table/>`, `<Slider/>`, `<Card/>`, `<Row/>`) for rendering MCP tool results
- **Auto-layout inference**: When a tool returns `structuredContent` without an explicit UI resource, dscode inspects the data structure and generates a default layout using built-in components
- **Optional MDX override**: Server can include an `_ui.mdx` string in `structuredContent` to override the auto-generated layout, giving full control without writing HTML
- **No Server HTML required**: `mcp-app.html` becomes optional; `examples/scenario-modeler/server.ts` no longer needs `s.resource()` for UI
- **All rendering runs in-browser**: MDX Runtime is injected into the sandbox page, parsed and rendered client-side for instant interactivity (sliders, chart updates)

## Capabilities

### New Capabilities

- `mdx-runtime`: Lightweight MDX-like parser and component renderer (Chart, Metrics, Table, Slider, Card, Row) running in the browser sandbox, capable of transforming structured data into interactive HTML
- `auto-layout-inference`: Heuristic engine that inspects `structuredContent` shape and selects appropriate MDX components and layout (array → Table, numeric series → Chart, key-value pairs → Metrics cards)
- `server-ui-override`: Server can optionally include `_ui.mdx` in `structuredContent` to provide explicit layout instructions, overriding auto-inference

### Modified Capabilities

- `mcp-app-sandbox-host`: Sandbox proxy page now includes the MDX Runtime JS bundle and supports both srcdoc (legacy HTML) and data-driven (MDX + data) rendering modes

## Impact

- **New files**: `src/ui/mdx/parser.ts` (MDX parser), `src/ui/mdx/components.ts` (built-in components), `src/ui/mdx/renderer.ts` (runtime orchestrator), `src/ui/mdx/inference.ts` (auto-layout engine)
- **Modified**: `src/apps/host.ts` (generate MDX+data when no HTML resource), `src/apps/sandbox.html` (include MDX runtime, support data mode)
- **Modified**: `examples/scenario-modeler/server.ts` (remove `s.resource()` and `mcp-app.html` dependency)
- **Removed**: `examples/scenario-modeler/mcp-app.html` (replaced by auto-generated MDX)
- **No new dependencies**: MDX parser is hand-written (~200 lines), no React/MDX libraries required
