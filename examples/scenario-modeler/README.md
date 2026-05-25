# Scenario Modeler — MCP App Example for dscode

A SaaS financial scenario modeler MCP App. Interactive 12-month projections with templates and parameter sliders.

## Quick Start

### CLI Mode (TUI)

```bash
cd examples/scenario-modeler
npm install
npm --prefix ../.. run build
npm start
```

Then ask: "Show me the current SaaS scenario projections."

Agent calls `get-scenario-data` → dscode renders the MCP App → TUI highlights the localhost link → open it in your browser.

### Web Mode

Run from the example directory so dscode picks up the local `.dscode/settings.json`:

```bash
cd examples/scenario-modeler
npm install
npm --prefix ../.. run build
npm --prefix ../.. run build:web
npm start -- --web --web-port 3000
```

> `npm start` runs `node ../../dist/dscode.mjs` from the current directory — no `--prefix` needed, so cwd stays as `examples/scenario-modeler` and the local MCP config is loaded.

Open `http://localhost:3000`, then ask: "Show me the current SaaS scenario projections."

When the agent calls `get-scenario-data`, the MCP App renders **inline in the chat** — click **"Open App ▼"** to expand the interactive dashboard with sliders, chart, and templates.

## Alternate startup

```bash
npm run start:server   # HTTP MCP server only (localhost:3100)
npm run start:stdio    # stdio MCP server only
```

## How it works

- **server.ts** — MCP server using `@modelcontextprotocol/sdk`. Registers:
  - `get-scenario-data` tool with `_meta.ui.resourceUri = "ui://scenario-modeler/mcp-app"`
  - `mcp-app.html` as a UI resource (`text/html;profile=mcp-app`)
  - `structuredContent` + `_ui.mdx` for MDX auto-layout fallback
- **mcp-app.html** — Pure JS dashboard with Canvas chart, 5 sliders, template comparison, postMessage bridge
- **Web inline rendering** — iframe embedded in the tool card, communicating via SSE bridge

## Files

| File | Purpose |
|------|---------|
| `server.ts` | MCP server with tool + resource registration |
| `mcp-app.html` | Interactive dashboard (served as MCP resource) |
| `package.json` | Dependencies and scripts |
| `.dscode/settings.json` | MCP config (loaded when running from this directory) |
