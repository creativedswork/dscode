<p align="center">
  <img src="docs/assets/dscode-logo.svg" alt="dscode" width="460" />
</p>

<p align="center">
  <strong>
    MCP-first coding agent for digital studios.<br />
    Powering creative work across Blender, game engines, and production tools.
  </strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@creative-dswork/dscode"><img src="docs/assets/badge-npm.svg" alt="npm version" /></a>
  <img src="docs/assets/badge-node.svg" alt="Node.js >=20" />
  <img src="docs/assets/badge-deepseek.svg" alt="DeepSeek native" />
  <img src="docs/assets/badge-spec-driven.svg" alt="spec driven" />
</p>

<p align="center">
  <sub><a href="README.zh-CN.md">中文文档</a></sub>
</p>

---

## See it in action

<table align="center">
<tr>
<td align="center" width="50%">
  <video src="https://github.com/user-attachments/assets/b92aedab-93cc-4188-976a-0fcae614c04d" controls width="100%"></video>
  <br /><sub><b>Web UI</b> — streaming chat, tool calls, permission dialogs</sub>
</td>
<td align="center" width="50%">
  <video src="https://github.com/user-attachments/assets/79790daa-d6f3-4d43-8306-e1d93561600c" controls width="100%"></video>
  <br /><sub><b>Terminal UI</b> — real-time streaming, slash commands, inline rendering</sub>
</td>
</tr>


> **Tip:** Videos play inline — click to watch demos directly in GitHub.

## What makes dscode different

<table>
<tr>
<td width="50%" valign="top">

### 🔌 MCP-First

Digital studios don't use one tool. They use ten. MCP turns every tool into an API — dscode is the agent that orchestrates them. Blender for 3D modeling, PlayCanvas for real-time graphics, browser automation for testing, documents for specs, spreadsheets for data. If your production tool has an MCP server, dscode brings it into the workflow.

**Your toolchain. One agent. All through MCP.**

</td>
<td width="50%" valign="top">

### 🧬 Spec-Driven Development

dscode is built entirely through **spec coding** with [OpenSpec](https://github.com/Fission-AI/OpenSpec). Every feature begins as a formal spec — `openspec/specs/` is the source of truth, code is the implementation. We don't encourage manual commits; all design and development flows through the SDD pipeline.

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

### 🐋 DeepSeek V4 Pro — Recommended

dscode is purpose-built for DeepSeek V4 Pro — our recommended model for digital creation. Its reasoning depth handles complex multi-tool workflows ("model this in Blender, render in PlayCanvas, document the result") without losing context. A **vision model fallback pipeline** transparently routes screenshots and reference images to vision-capable models. Prompt caching is tuned to maintain **97–99% cache hit rates** via `prompt_cache_key` affinity and prefix-stable message construction. Every optimization is measured against DeepSeek's API behavior.

**DeepSeek V4 Pro. For when your toolchain needs more than autocomplete.**

</td>
</tr>
</table>

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

### See what MCP can do

<table align="center">
<tr>
<td align="center" width="50%">
  <video src="https://github.com/user-attachments/assets/917414f9-9f39-457e-9358-98f6abe01220" controls width="100%"></video>
  <br /><sub><b>PlayCanvas + MCP</b> — build a jump game entirely through natural language</sub>
</td>
<td align="center" width="50%">
  <video src="https://github.com/user-attachments/assets/cf62021e-bb1c-4aa3-953d-b0d09631a1ef" controls width="100%"></video>
  <br /><sub><b>Blender + MCP</b> — 3D modeling and scene composition through conversation</sub>
</td>
</tr>
</table>

> **Tip:** Videos play inline — these are real MCP workflows, click to watch.

## Install

```bash
npm install -g @creative-dswork/dscode
dscode              # Terminal UI
dscode --web        # Web UI → http://localhost:3000
```

> First launch? Run `/config key <your-api-key>` and `/config model deepseek-v4-pro` to get started. Type `/help` for the full guide.

**Build from source:**

```bash
git clone https://github.com/creativedswork/dscode.git
cd dscode && npm install && npm run build
node dist/dscode.mjs
```

---

## Configuration

dscode uses two levels of `settings.json`, merged with project settings overriding user settings:

| Scope | Path | Purpose |
|-------|------|---------|
| User | `~/.dscode/settings.json` | Defaults across all projects |
| Project | `.dscode/settings.json` | Per-project overrides |

> **Note:** Model configuration (`provider`, `modelId`, `apiKey`, `thinkingLevel`) lives in `~/.dscode/config.json`, managed via `/config` commands. Type `/help` in-session for the full command list.

### Quick reference

```jsonc
// ~/.dscode/settings.json
{
  // --- MCP Servers ---
  "mcpServers": {
    "blender": {
      "command": "uvx",
      "args": ["blender-mcp"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@anthropic/mcp-playwright"]
    },
    "my-api": {
      "url": "https://my-mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  },

  // --- Permissions ---
  "permissions": {
    "allow": [
      "Bash(git add *)",
      "Bash(npm *)"
    ],
    "deny": [
      "Bash(rm -rf *)"
    ],
    "rules": [
      { "tool": "Bash(curl *)", "decision": "allow", "priority": 5 }
    ]
  },

  // --- Skills ---
  "skills": ["brandkit", "minimalist-ui"],

  // --- Retry ---
  // Controls how dscode retries failed API calls (rate limits, timeouts, server errors).
  // Uses exponential backoff: starts at baseDelayMs, doubles each retry, capped at maxDelayMs.
  "retry": {
    "maxRetries": 3,           // Max retry attempts before giving up
    "baseDelayMs": 1000,       // Initial delay before first retry (ms)
    "maxDelayMs": 30000,       // Upper bound on backoff delay (ms)
    "retryOnTimeout": true,    // Retry when the provider times out
    "retryOnRateLimit": true,  // Retry when hitting rate limits (respects Retry-After header)
    "retryOnServerError": true // Retry on 5xx server errors
  },

  // --- @-file limits ---
  "atFileMaxFiles": 5,
  "atFileMaxFileSize": 51200,
  "atFileMaxTotalSize": 204800
}
```

### MCP server config

Each server under `mcpServers` supports:

| Field | Type | Description |
|-------|------|-------------|
| `command` | string | Executable (for stdio transport) |
| `args` | string[] | Arguments passed to the command |
| `url` | string | HTTP endpoint (for streamable-http transport) |
| `env` | object | Extra environment variables for the server process |
| `headers` | object | Custom HTTP headers |
| `transport` | string | `"stdio"` \| `"streamable-http"` \| `"sse"` (auto-detected if omitted) |
| `preferredProtocolVersion` | string | `"2025-11-25"` \| `"2025-03-26"` \| `"2024-11-05"` |
| `requestTimeoutMs` | number | Per-request timeout |
| `connectTimeoutMs` | number | Connection timeout |

> **Tip:** Transport is auto-detected — if `url` is set without `command`, streamable-http is used. Otherwise stdio.

### Environment variables

All settings can also be set via environment variables for CI / containers:

| Variable | Setting |
|----------|---------|
| `DEEPSEEK_API_KEY` | API key (provider-specific vars also supported: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) |
| `AGENT_PROVIDER` | Provider override |
| `AGENT_MODEL` | Model override |
| `AGENT_THINKING_LEVEL` | Thinking level override |
| `AGENT_VISION_PROVIDER` | Vision model provider |
| `AGENT_VISION_MODEL` | Vision model ID |
| `DSCODE_MAX_TOKENS` | Max tokens |
| `DSCODE_CONFIG_HOME` | Custom config directory (default: `~/.dscode`) |
| `DSCODE_DATA_HOME` | Custom data directory |
| `DSCODE_PROJECT_PATH` | Project directory |
| `DSCODE_RETRY_MAX_RETRIES` | Retry max retries |
| `DSCODE_RETRY_BASE_DELAY_MS` | Retry base delay |
| `DSCODE_RETRY_MAX_DELAY_MS` | Retry max delay |

---


## Harness Philosophy

We follow **Occam's razor** in harness design. dscode does not pre-build intent understanding modules, plan modes, or elaborate agentic scaffolding until the system prompt proves insufficient. Most coding agents pile on pre-turn planning, reflection loops, and multi-agent orchestration upfront — we wait until the model demands it.

That doesn't mean the harness is bare. It means every piece earns its place.

One example where we went deeper: the **edit tool**. Based on [@_can1357's hash-anchor protocol](https://x.com/_can1357/status/2021828033640911196), our `edit` tool replaces fragile line-number and regex-based editing with a **content-addressable anchor system** ([spec](openspec/specs/edit-tool/spec.md)):

- **Three-level adaptive resolution** — ambiguous 6-char hashes are resolved silently through 8-char → context-augmented (3-line window) matching before rejection
- **Occurrence + line-hint disambiguation** — `occurrence: 3` picks the Nth match; `line` field auto-selects the closest candidate, rejecting only when equidistant
- **Proximity-based range resolution** — for range endpoints, if one side is unique the other automatically resolves to the nearest candidate in the correct direction
- **Low-entropy filtering** — lines like `}` are rejected as anchors; the tool returns up to 6 neighboring `[high]` anchors as alternatives
- **Atomic batch + overlap detection** — 6 operation types in one call, all-or-nothing. Overlapping ranges within a batch are detected and rejected
- **Checkpoint + safety rollback** — file checkpointed before edit. Post-edit sanity checks (duplicate lines, delimiter balance, orphan `else`) roll back suspicious changes
- **Structured invalidation scope** — `anchors_valid_through` and `must_refresh_from_line` tell the model exactly which anchors survive, enabling chained edits without re-reading
- **Localized diff with live anchors** — successful edits return a diff with fresh 6-char hashes, so the model can continue editing immediately

**dscode builds dscode.** This edit tool — combined with our spec-driven workflow — is what enabled dscode to develop itself. Every feature, from the hash-anchor protocol to the checkpoint system, was implemented by dscode running on DeepSeek V4 Pro, editing its own source tree through MCP-driven tools. It's not a demo. It's how this project ships.

This is the kind of harness work we invest in: not adding more AI, but making the AI's tools dependable.

---

## Learn more

| Document | What's inside |
|----------|---------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full architecture: Agent as OS, 6-layer design, Driver/Skill model, source tree |
| [ROADMAP.md](docs/ROADMAP.md) | What's next: Sub-Agent system, System Prompt modularization, Diff-based editing |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute: philosophy alignment, OpenSpec SDD workflow, coding conventions |
| [STYLE.md](docs/STYLE.md) | TypeScript coding style: naming, imports, module structure, error handling |

---

## Acknowledgments

dscode stands on the shoulders of:

- **[OpenSpec](https://github.com/Fission-AI/OpenSpec)** — the spec-driven development framework that shapes our entire workflow

- **[pi-ai](https://www.npmjs.com/package/@mariozechner/pi-ai) / [pi-agent-core](https://www.npmjs.com/package/@mariozechner/pi-agent-core)** — Mario Zechner's agent loop and model abstraction foundation
- **[taste-skill](https://github.com/Leonxlnx/taste-skill)** — Leonxlnx's design taste skill system, inspired our skills architecture
- **[@_can1357](https://x.com/_can1357/status/2021828033640911196)** — hash-anchor editing protocol, the cornerstone of our `edit` tool

---

<p align="center">
  <sub>If you like this project, give it a ⭐ Star — your support keeps dscode evolving.</sub>
</p>
