<p align="center">
  <img src="docs/assets/dscode-logo.svg" alt="dscode" width="460" />
</p>

<p align="center">
  <strong>
    MCP-first, spec-driven AI agent for DeepSeek.<br />
    Built for digital creation — not just another coding CLI.
  </strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@wangcan26/dscode"><img src="docs/assets/badge-npm.svg" alt="npm version" /></a>
  <img src="docs/assets/badge-node.svg" alt="Node.js >=20" />
  <img src="docs/assets/badge-deepseek.svg" alt="DeepSeek native" />
  <img src="docs/assets/badge-spec-driven.svg" alt="spec driven" />
</p>

<p align="center">
  <sub><a href="README.zh-CN.md">中文文档</a></sub>
</p>

---

## What makes dscode different

<table>
<tr>
<td width="50%" valign="top">

### 🔌 MCP-First

We treat MCP as a **first-class extension mechanism**, not an afterthought. dscode tracks the latest MCP spec aggressively and prefers implementing capabilities through MCP servers — Blender 3D modeling, PlayCanvas, browser automation, document processing, spreadsheets. If a tool has an MCP server, dscode connects.

**MCP is not a feature. It's the foundation.**

</td>
<td width="50%" valign="top">

### 🧬 Spec-Driven Development

dscode is built entirely through **spec coding** with [OpenSpec](https://github.com/anthropics/open-spec). Every feature begins as a formal spec — `openspec/specs/` is the source of truth, code is the implementation. We don't encourage manual commits; all design and development flows through the SDD pipeline.

**Code is the implementation of specs — not the other way around.**

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🔍 MCP Tool Search

Too many MCP servers? Context explosion is a real problem when every tool schema competes for token budget. dscode ships with a built-in `search_tools` driver — MCP tools are discovered **on-demand** by the model, not pre-loaded. Only the tools actually needed enter the context window. Connect dozens of MCP servers without worrying about overhead.

**All the tools. None of the bloat.**

</td>
<td width="50%" valign="top">

### 🐋 DeepSeek Native

dscode is purpose-built for DeepSeek. A **vision model fallback pipeline** transparently routes images to vision-capable models when the primary model lacks multimodal support. Prompt caching is tuned to maintain **97–99% cache hit rates** via `prompt_cache_key` affinity and prefix-stable message construction. Every optimization is measured against DeepSeek's API behavior.

**Not just compatible. Optimized.**

</td>
</tr>
</table>

---

## See it in action

<p align="center">
  <video src="docs/screen_shots/show_dscode.mp4" width="720" controls muted loop playsinline poster="docs/screen_shots/web-ui.gif"></video>
</p>

<p align="center">
  <img src="docs/screen_shots/blender_show.jpg" alt="Blender MCP" width="360" />
  <img src="docs/screen_shots/blender_show1.jpg" alt="Blender MCP demo" width="360" />
</p>

<p align="center">
  <sub>Web UI with streaming chat, tool calls, and permission dialogs. Controlling Blender via MCP.</sub>
</p>

---

## Install

```bash
npm install -g @wangcan26/dscode
dscode              # Terminal UI
dscode --web        # Web UI → http://localhost:3000
```

> First launch? Run `/config key <your-api-key>` and `/config model deepseek-v4-pro` to get started. Type `/help` for the full guide.

**Build from source:**

```bash
git clone https://github.com/wangcan26/dscode.git
cd dscode && npm install && npm run build
node dist/dscode.mjs
```

---

## Capabilities

<table>
<tr>
<td width="33%" valign="top">
  <strong>🖥 Terminal + Web</strong><br />
  <sub>Full TUI with streaming, thinking, tool calls. Modern React Web UI with identical feature parity via WebSocket.</sub>
</td>
<td width="33%" valign="top">
  <strong>🔌 MCP Connector</strong><br />
  <sub>Stdio, Streamable HTTP (MCP 2025-11-25), legacy SSE fallback. Auto transport inference. MCP App sandbox for server-driven UI.</sub>
</td>
<td width="33%" valign="top">
  <strong>🛡 Agent Harness</strong><br />
  <sub>Permission control, context compression (1M token window), session persistence, cross-session memory, retry with exponential backoff.</sub>
</td>
</tr>
<tr>
<td width="33%" valign="top">
  <strong>📦 Skills System</strong><br />
  <sub>Declarative third-party extensions via SKILL.md. On-demand activation. User-level + project-level scopes.</sub>
</td>
<td width="33%" valign="top">
  <strong>👁 Vision Pipeline</strong><br />
  <sub>Auto-routing to vision-capable models. tesseract OCR fallback (ENG + CHI). Drag, paste, or @-file images.</sub>
</td>
<td width="33%" valign="top">
  <strong>🔧 Built-in Drivers</strong><br />
  <sub><code>read_file</code>, <code>write_file</code>, <code>edit</code> (hash-anchor), <code>bash</code>, <code>grep</code>, <code>glob</code>. MCP tools discovered on-demand via <code>search_tools</code>.</sub>
</td>
</tr>
</table>

---

## MCP in 30 seconds

```jsonc
// ~/.dscode/settings.json
{
  "mcpServers": {
    "blender": {
      "command": "uvx",
      "args": ["blender-mcp"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@anthropic/mcp-playwright"]
    }
  }
}
```

dscode auto-connects on launch. Tools appear as `mcp_blender_*` and `mcp_playwright_*`. MCP servers can also serve sandboxed UI via the App Host — no boilerplate, no SDK, no glue code.

---

## Learn more

| Document | What's inside |
|----------|---------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full architecture: Agent as OS, 6-layer design, Driver/Skill model, source tree |
| [ROADMAP.md](docs/ROADMAP.md) | What's next: Sub-Agent system, System Prompt modularization, Diff-based editing |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute: philosophy alignment, OpenSpec SDD workflow, coding conventions |
| [STYLE.md](docs/STYLE.md) | TypeScript coding style: naming, imports, module structure, error handling |

---

<p align="center">
  <sub>If you like this project, give it a ⭐ Star — it keeps dscode evolving.</sub>
</p>
