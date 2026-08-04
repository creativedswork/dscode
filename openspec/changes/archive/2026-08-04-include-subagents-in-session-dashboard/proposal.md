## Why

Session Dashboard currently summarizes only Main Agent context, tool calls, and
timing even though SubAgent executions are first-class Session records in
`agentMessages`. This hides delegated work from the operational overview and can
leave a cached Dashboard stale after a background SubAgent completes.

## What Changes

- Include terminal SubAgent execution aggregates in the Session Dashboard summary:
  total count, outcome counts/rates, Application distribution, and delegated time.
- Include overview-only per-Agent records with short Agent ID, Application, state,
  duration, one-line task summary, and one-line outcome summary.
- Require the generated Dashboard to render SubAgent headline metrics and an Agent
  Processes section, including explicit failed and no-Agent states.
- Include `agentMessages` in Dashboard cache invalidation so completion or failure of
  a SubAgent invalidates an older artifact for the same Session.
- Preserve Main Agent inference isolation: Dashboard generation reads persisted UI
  records but does not append SubAgent content to `agent.state.messages`.
- Keep full SubAgent input/output exclusively in Chat Agent Activity; Dashboard MUST
  NOT render transcript-like Input/Result blocks or expandable details.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-dashboard`: Extend the structured Dashboard summary and generated visual
  requirements to cover persisted SubAgent executions.
- `dashboard-cache`: Invalidate cached Dashboard artifacts when the current Session's
  `agentMessages` change.

## Impact

- `src/ui/web/web-backend.ts`: Dashboard summary aggregation and generation prompt.
- `src/session/manager.ts`: Dashboard content hash inputs.
- Session Dashboard tests and Session hash/cache tests.
- `openspec/specs/session-dashboard/spec.md` and
  `openspec/specs/dashboard-cache/spec.md`.
- No wire protocol, Session v3 schema, Agent Process Store, or runtime dependency
  changes.
