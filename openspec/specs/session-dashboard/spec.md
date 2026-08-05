## ADDED Requirements

### Requirement: Dashboard auto-generates on view mode switch
When the user switches from "Chat" to "Dashboard" view mode, the frontend SHALL automatically send an `artifact generate` command with `context: "session_dashboard"`.

#### Scenario: Trigger dashboard generation
- **WHEN** the user selects "Dashboard" from the View Mode dropdown
- **THEN** the frontend sends `{ "type": "artifact", "action": "generate", "context": "session_dashboard" }` to the server
- **AND** the ArtifactContainer renders with a loading state until `artifact_end` arrives

### Requirement: Rich session summary for LLM
The backend SHALL construct a detailed JSON summary for the `session_dashboard` artifact prompt containing:

- **Token usage**: total / used / free / usage%, plus per-category breakdown with absolute and percentage values (system, rules, user, thinking, readwrite, edit, shell, skill, mcp, other)
- **Tool statistics**: per-tool entries with `{ name, callCount, successCount, errorCount, successRate% }`, sorted by callCount descending; include a totalToolsCalled count
- **Timing**: sessionActiveMs formatted as human-readable, along with the raw milliseconds; if the session has multiple turns, include turnCount and average turn duration
- **Context window health**: a "pressure score" derived from `used/total` (0–100%), categorized as low (<50%) / moderate (50–80%) / high (>80%) / critical (>95%)
- **Top tools**: the top 3 most-called tools with their success rates, flagged with a warning marker if errorRate > 20%
- **SubAgent statistics**: total count, per-state counts, success rate, total delegated duration, and per-Application counts
- **SubAgent records**: creation-ordered entries with six-character Agent ID, Application, state, raw/formatted duration, one-line task summary (maximum 100 characters), and one-line outcome summary (maximum 120 characters)

Main Agent message content SHALL NOT be included. Bounded SubAgent input and
output/error SHALL only be transformed into the one-line task/outcome summaries from
persisted `agentMessages`; full Agent Process transcripts MUST NOT be loaded.

#### Scenario: Rich session summary in prompt
- **WHEN** the backend receives `artifact generate` with `context: "session_dashboard"` and the session has data
- **THEN** the LLM prompt includes all fields above as a structured JSON block
- **AND** pre-computed percentages and derived metrics (pressure score, top tools, SubAgent success rate) are included

#### Scenario: Summary includes completed and failed SubAgents
- **WHEN** the current Session contains two completed and one failed `agentMessages` records
- **THEN** the summary contains `total: 3`, completed and failed counts, and `successRate: 67`
- **AND** each execution record contains a short Agent ID, Application, state, duration, task summary, and outcome summary

#### Scenario: Summary has no SubAgents
- **WHEN** the current Session contains no `agentMessages`
- **THEN** the summary contains a `subagents` object with zero totals and an empty records array

#### Scenario: Long SubAgent output becomes a one-line overview
- **WHEN** a persisted SubAgent output exceeds the configured summary limit
- **THEN** the Dashboard summary contains a whitespace-normalized outcome summary of at most 120 characters
- **AND** the full Agent Process transcript is not read or serialized

#### Scenario: Partial data summary
- **WHEN** some data categories are unavailable (e.g., no context_window event received yet)
- **THEN** missing fields are marked as `null` in the JSON and the LLM is instructed to display "—" for those metrics

### Requirement: Dashboard visualizes SubAgent executions
The generated Session Dashboard SHALL treat persisted SubAgent executions as a
first-class operational dimension while keeping them visually distinct from Main Agent
tool statistics.

#### Scenario: Dashboard with SubAgent records
- **WHEN** the structured summary contains one or more SubAgent records
- **THEN** the Dashboard headline metrics include SubAgent count and success rate
- **AND** an Agent Processes section displays Application, short Agent ID, state, duration, one-line task summary, and one-line outcome summary for each record

#### Scenario: Dashboard does not duplicate Agent conversation detail
- **WHEN** a SubAgent persisted input or output contains multiple paragraphs or detailed prose
- **THEN** the Agent Processes section MUST NOT render transcript-style `Input:` or `Result:` blocks
- **AND** MUST NOT render full SubAgent text, multi-paragraph content, or expandable details
- **AND** the complete content remains available only in Chat Agent Activity

#### Scenario: Dashboard highlights failed SubAgent
- **WHEN** a SubAgent record has state `failed`, `terminated`, or `killed`
- **THEN** its state and error summary use the Dashboard error semantic color and visible status text
- **AND** failure is not communicated by color alone

#### Scenario: Dashboard without SubAgent records
- **WHEN** the structured summary contains zero SubAgent records
- **THEN** the Dashboard displays a Main-Agent-only empty state instead of omitting the Agent section ambiguously

#### Scenario: Main and SubAgent metrics remain distinct
- **WHEN** the Dashboard displays Main tool calls and SubAgent executions
- **THEN** Main tool totals do not include inferred child-process tool calls
- **AND** delegated duration is labeled separately from Session active time

### Requirement: Rich visual dashboard design
The LLM SHALL generate a visually rich dashboard using the following design principles:

- **Emoji icons**: Each metric card and chart section SHALL be prefixed with a relevant emoji (e.g., 🪙 Token, ⏱️ Timing, 🔧 Tools, 📊 Pressure, ⚠️ Warnings)
- **Data richness**: Every metric SHALL include both absolute numbers AND contextual indicators (percentages, trends, ratios, rankings)
- **Color coding**: Use semantic colors — green for healthy/success, amber for warning/moderate, red for critical/error; the palette SHALL be explicitly defined in CSS variables within `<style>`
- **Multiple visual forms**: The same data MAY appear in multiple forms (e.g., token usage shown as both a progress bar and a donut chart using SVG or CSS conic-gradient)
- **Summary row**: A top-level summary strip with 4–6 key headline metrics (session time, total tokens used, tool calls, error rate, pressure score)

#### Scenario: Dashboard with icons and colors
- **WHEN** the LLM generates a dashboard with token data showing 75% usage
- **THEN** the token section includes an emoji icon, a progress bar colored amber (moderate), and both absolute (e.g., "150K / 200K") and percentage ("75%") labels

#### Scenario: Dashboard highlights warnings
- **WHEN** any tool has >20% error rate
- **THEN** that tool's row is highlighted with ⚠️ and a red-toned background

### Requirement: Dashboard HTML must be self-contained
The LLM SHALL generate a single, self-contained HTML document with all CSS inlined in `<style>` tags within `<head>`. External resources (fonts, images, scripts) SHALL NOT be referenced. Emoji and Unicode symbols SHALL be used as visual markers; CSS `conic-gradient` and SVG inline SHALL be used for chart-like elements where beneficial. The HTML SHALL use `system-ui, -apple-system, sans-serif` for labels and `monospace` for data values.

#### Scenario: Self-contained HTML with inline SVG
- **WHEN** the LLM generates a dashboard artifact
- **THEN** all CSS is inlined in `<style>` tags
- **AND** charts use CSS gradients or inline SVG (no external libraries)
- **AND** no external fonts, images, or scripts are referenced

### Requirement: Dashboard re-generates on each switch
Each time the user switches from Chat to Dashboard, the frontend SHALL send a fresh `artifact generate` command UNLESS a valid cached dashboard exists for the current session (cached `contentHash` matches the session's current `contentHash`). Previously rendered artifact content from a different session SHALL be discarded.

#### Scenario: Fresh dashboard on switch when no cache
- **WHEN** the user is in Dashboard mode, switches to Chat, then back to Dashboard
- **AND** no valid cache entry exists for the current session
- **THEN** the previous artifact HTML is discarded and a new `artifact generate` command is sent

#### Scenario: Cached dashboard used on switch
- **WHEN** the user is in Dashboard mode, switches to Chat, then back to Dashboard
- **AND** a valid cache entry exists for the current session (contentHash matches)
- **THEN** the cached HTML is rendered immediately
- **AND** no `artifact generate` command is sent
