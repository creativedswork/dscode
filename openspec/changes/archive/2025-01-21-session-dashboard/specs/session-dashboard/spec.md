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
- **Top tools**: the top 3 most-called tools with their success rates, flagged with ⚠️ if errorRate > 20%

Message content SHALL NOT be included.

#### Scenario: Rich session summary in prompt
- **WHEN** the backend receives `artifact generate` with `context: "session_dashboard"` and the session has data
- **THEN** the LLM prompt includes all fields above as a structured JSON block
- **AND** pre-computed percentages and derived metrics (pressure score, top tools) are included

#### Scenario: Partial data summary
- **WHEN** some data categories are unavailable (e.g., no context_window event received yet)
- **THEN** missing fields are marked as `null` in the JSON and the LLM is instructed to display "—" for those metrics

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
Each time the user switches from Chat to Dashboard, the frontend SHALL send a fresh `artifact generate` command. Previously rendered artifact content SHALL be discarded.

#### Scenario: Fresh dashboard on switch
- **WHEN** the user is in Dashboard mode, switches to Chat, then back to Dashboard
- **THEN** the previous artifact HTML is discarded and a new `artifact generate` command is sent
