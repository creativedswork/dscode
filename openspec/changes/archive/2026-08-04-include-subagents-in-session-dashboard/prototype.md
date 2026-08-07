## Prototype Files

- [`docs/prototypes/archive/2026-08-04-include-subagents-in-session-dashboard/include-subagents-in-session-dashboard-overview.html`](../../../../docs/prototypes/archive/2026-08-04-include-subagents-in-session-dashboard/include-subagents-in-session-dashboard-overview.html)
  — Self-contained Session Dashboard prototype with SubAgent headline metrics,
  Agent Processes records, outcome mix, and explicit Healthy, Failure, and No agents
  data states.

## Visual Direction

- SubAgent execution is a first-class Dashboard dimension, represented by total count
  and success rate in the headline metrics strip.
- Agent Processes remains separate from Main Agent tool statistics. Each record shows
  Application, six-character Agent ID, state text and indicator, duration, bounded
  one-line task summary, and one-line outcome summary.
- Agent records are overview-only: no `Input:`/`Result:` transcript blocks, full
  SubAgent prose, expandable details, or multi-paragraph content.
- Failed records use both error color and visible status text; the design does not rely
  on color alone.
- Sessions without delegated work keep the section and show a clear Main-Agent-only
  empty state.
- Delegated duration is labeled independently from Session active time because
  parallel Agents can overlap.
- The artifact follows the existing warm editorial tokens, flat borders, no shadows or
  gradients, and responsive stacking at 900px and 620px.

## Prototype Status

Browser-validated on 2026-08-04:

- Healthy, Failure, and No agents state controls update the metrics and records.
- Light/dark theme switching renders with the matching semantic tokens.
- Full-page screenshots were inspected for populated, failed, and empty states.
- Browser console reported no errors on a clean load or after interactions.

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/archive/2026-08-04-include-subagents-in-session-dashboard/include-subagents-in-session-dashboard-overview.html` | `archive` | 保留 Healthy、Failure、No agents 三态及 Dashboard 信息密度契约，仍可用于后续 Session 指标设计评审。 |
