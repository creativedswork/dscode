# Scenario Modeler — MCP App Example for dscode

A SaaS financial scenario modeler MCP App. Interactive 12-month projections with templates and parameter sliders.

## Quick Start

```bash
cd examples/scenario-modeler
npm install
npm --prefix ../.. run build
npm start
```

`npm start` launches the current repo build of dscode from this example directory. dscode then starts the `scenario-modeler` MCP server through the existing stdio MCP config, so you only need one terminal.

Then ask the agent: "Show me the current SaaS scenario projections."

If the agent replies with plain text only, ask it to use the `get-scenario-data` MCP tool explicitly.

Agent calls `get-scenario-data` → dscode renders the MCP App → TUI highlights the localhost link → open it in your browser.

## Alternate startup modes

```bash
npm run start:server   # start only the HTTP MCP server on localhost:3100
npm run start:stdio    # start only the stdio MCP server
```

## How it works

- **server.ts** — Standard MCP server using `@modelcontextprotocol/sdk`. Registers:
  - `get-scenario-data` tool with `_meta.ui.resourceUri = "ui://scenario-modeler/mcp-app"`
  - Returns `structuredContent` with templates, projections, and summary data
  - Includes `_ui.mdx` to demonstrate a custom MDX layout override
  - **No HTML required** — dscode renders the dashboard from data + MDX
- **Auto-generated UI** — dscode inspects `structuredContent` and renders:
  - Chart from projection arrays (line chart with MRR/netProfit curves)
  - Metrics cards from summary key-value pairs
  - Table from template/projection data
- **No external dependencies** — UI is rendered by dscode's built-in MDX Runtime

## Features

- 12-month line chart (MRR, Gross Profit, Net Profit) — auto-generated from data
- Metric cards showing ending MRR, ARR, total revenue, profit, growth %, break-even
- 5 pre-built templates (Bootstrapped, VC Rocketship, Cash Cow, Turnaround, Efficient Growth)
- Custom projection computation via tool arguments
- Light/dark theme support (via CSS custom properties)

## Transport

```bash
npm start          # HTTP (default, port 3100)
npm run start:stdio  # stdio for direct MCP client connection
```
