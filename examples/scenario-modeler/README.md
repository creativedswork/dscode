# Scenario Modeler — MCP App Example for dscode

A SaaS financial scenario modeler MCP App. Interactive 12-month projections with templates and parameter sliders.

## Quick Start

```bash
cd examples/scenario-modeler
npm install
npm start
```

Server starts on http://localhost:3100/mcp

## Connect to dscode

```
/config mcp add scenario-modeler --url http://localhost:3100/mcp
```

Then ask the agent: "Show me the SaaS scenario modeler"

Agent calls `get-scenario-data` → dscode fetches the UI HTML → TUI displays a localhost URL → open in browser.

## How it works

- **server.ts** — Standard MCP server using `@modelcontextprotocol/sdk`. Registers:
  - `get-scenario-data` tool with `_meta.ui.resourceUri = "ui://scenario-modeler/mcp-app"`
  - `ui://scenario-modeler/mcp-app` resource returning `mcp-app.html`
- **mcp-app.html** — Single-file interactive View. Zero external dependencies.
  - MCP protocol handshake via postMessage
  - Canvas API for projection chart
  - DOM API for sliders and metric cards
  - Local calculation for instant feedback

## Features

- 5 sliders: Starting MRR, Growth Rate, Churn Rate, Gross Margin, Fixed Costs
- 12-month line chart (MRR, Gross Profit, Net Profit)
- 5 pre-built templates (Bootstrapped, VC Rocketship, Cash Cow, Turnaround, Efficient Growth)
- Template comparison with dashed overlay lines
- Light/dark theme support

## Transport

```bash
npm start          # HTTP (default, port 3100)
npm run start:stdio  # stdio for direct MCP client connection
```
