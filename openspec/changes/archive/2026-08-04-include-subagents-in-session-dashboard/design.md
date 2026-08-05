## Context

The Session Dashboard is an LLM-generated, self-contained HTML artifact. The Web
backend builds a structured JSON summary from Main Agent messages, context usage,
tool calls, and Session timing, then asks an independent model call to render it.

SubAgent terminal records already live in Session v3 `agentMessages`, and the
conversation UI projects those records through the canonical Agent Activity model.
`buildSessionSummary()` does not currently read them. The Dashboard cache key has a
related gap: `SessionMetadata.contentHash` is derived only from Main messages, so a
background Agent exit can leave a previously generated Dashboard looking valid.

Constraints:

- `agentMessages` remains the durable lightweight source for Dashboard data.
- Full Agent Process transcripts remain in AgentProcessStore and are not loaded.
- SubAgent records must not enter `agent.state.messages` or Main model context.
- Dashboard HTML remains generated and self-contained; this change does not add a
  second React-rendered Dashboard path.
- Existing Session v1/v2/v3 files remain readable without migration.

## Goals / Non-Goals

**Goals:**

- Make delegated work visible in Dashboard headline metrics and an Agent Processes
  section.
- Provide deterministic aggregate fields and bounded per-Agent summaries to the
  Dashboard generator.
- Represent completed, failed, terminated, killed, and no-Agent states.
- Invalidate cached Dashboard HTML whenever persisted SubAgent records change.
- Reuse the existing six-character Agent ID display convention.

**Non-Goals:**

- Live-process monitoring or control from Dashboard.
- Displaying complete SubAgent transcripts or per-tool child-process traces.
- Changing `AgentSessionMessage`, the WebSocket protocol, or Agent Process lifecycle.
- Replacing the LLM-generated Dashboard with a React component.
- Adding SubAgent records to token or Main tool-call statistics.

## Decisions

### 1. Aggregate persisted `agentMessages` in `buildSessionSummary()`

The backend will read `sessionManager.agentMessages` and add a `subagents` object:

- `total`, outcome counts, `successRate`, and `totalDurationMs/formatted`;
- per-Application counts;
- ordered execution records containing short `agentId`, Application, state, duration,
  one-line `taskSummary`, and one-line `outcomeSummary`.

Records are sorted by `createdAt`, and text fields are normalized and truncated before
JSON serialization. Task summaries are capped at 100 characters and outcome summaries
at 120 characters. The prompt will explicitly require an Agent Processes section when
records exist and a Main-Agent-only empty state when none exist.

**Alternative:** Pass rebuilt conversation Agent Activity messages to the generator.
This couples Dashboard generation to display ordering and includes live UI concerns.
Persisted `agentMessages` is the smaller and more stable contract.

### 2. Keep Main metrics and SubAgent metrics separate

Existing token usage and tool statistics continue to describe Main Agent context.
SubAgent executions receive their own aggregates rather than being merged into totals
that cannot be computed accurately from lightweight Session records.

**Alternative:** Read every Agent Process transcript and merge child token/tool usage.
That expands I/O and changes the meaning and retention boundary of the Dashboard.

### 3. Include `agentMessages` in the canonical Dashboard content hash

A pure content-hash helper will hash a stable projection of both Main messages and
`agentMessages`. The projection includes fields that affect Dashboard output:
`agentId`, Application, state, timestamps, prompt, output, and error.

The helper will be used by normal current-Session saves and by non-current Session
Agent upserts. This ensures background completion updates Session metadata and causes
the existing frontend hash comparison to miss the stale cache naturally.

**Alternative:** Clear localStorage on every `agent_activity` event. That only works
for the currently connected browser, duplicates cache policy in the UI, and misses
background completion for a non-visible Session.

### 4. Dashboard records are overview-only

The Dashboard receives only one-line task/outcome summaries. It does not receive
fields named `input` or `result`, and the generation prompt forbids transcript-style
Input/Result blocks, full text copying, expandable details, and multi-paragraph Agent
content. Full execution detail remains available in Chat Agent Activity.

**Alternative:** Include longer bounded `AgentSessionMessage.output.text`. Even when
technically bounded, this still looks like a detailed conversation and duplicates Chat.

### 5. Bump Dashboard content identity

The canonical Dashboard content hash includes a format-version marker. Changing the
SubAgent rendering contract bumps this marker so localStorage entries generated with
the detailed layout no longer match and are regenerated automatically.

## Risks / Trade-offs

- **[Dashboard shows terminal records only]** → Label the section as execution records;
  live monitoring stays in Chat Agent Activity.
- **[Many Agents increase prompt size]** → Bound every record and test serialized size
  behavior with long inputs/outputs.
- **[Existing cache preserves old detailed HTML]** → Bump Dashboard content identity
  so the first switch after upgrade regenerates the artifact.
- **[Hash changes invalidate existing cached HTML once]** → Accept the one-time cache
  miss; regeneration is the correct behavior.
- **[LLM may omit requested fields]** → Provide deterministic JSON fields and explicit
  prompt requirements; verify the prompt contract in unit tests.
- **[Legacy Vision records appear as Agents]** → Use the existing SessionManager
  migration path so Vision remains a normal SubAgent Application.
