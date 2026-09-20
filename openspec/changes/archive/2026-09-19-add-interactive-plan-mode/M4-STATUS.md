# M4 Status

Status: `COMMITTED`

## Scope

Completed tasks 5.1-5.6 only:

- Added the `PlanService` facade over the existing planner, execution, and store
  responsibilities.
- Exposed immutable Plan reads and typed decision, approval, verification,
  replanning, and cancellation mutations through `HarnessAPI`.
- Added durable decision and approval requests to `UserInteractionPort`.
- Added presentation-neutral route, updated, interaction, approval, execution,
  and conflict events.
- Added API and event-ordering tests.
- Fixed the independent-review P1 so stale verification, replanning, and
  semantic approval commands preserve the authoritative current Plan.

M5 WebSocket and shared projection work was not started.

## Implementation Notes

- `PlanStore` remains the single persisted source of truth. `PlanService` keeps
  only a session-to-active-plan index and per-adapter notification deduplication;
  neither contains mutable Plan state.
- A shared PlanStore mutation observer emits `plan:updated` after every atomic
  commit and exactly one `plan:conflict` after typed CAS conflicts from Planner
  tools, execution, or direct PlanStore mutations. PlanService emits the single
  conflict event for stale semantic approval failures that do not reach a store
  CAS conflict.
- Execution state maps store CAS failures from `conflict.current`, while stale
  semantic approval failures reload the authoritative snapshot before the
  `PlanMutationResult` mapping boundary.
- Decision and approval adapters are called only after the pending interaction
  commit. Repeated requests and replay through the same adapter do not notify
  twice; a newly attached adapter can receive the persisted pending interaction.
- Failed mutations emit no success event. CAS failures emit only
  `plan:conflict`.
- Approval command replay remains first. New commands perform expectedVersion
  CAS before status, revision, digest, interaction, compiled-plan, and
  acknowledgement validation in the updater.
- Once a mutation commits, its API result remains the success receipt and
  snapshot. Interaction resolution, terminal cleanup, approved Planner
  completion, replanning startup, and Main attachment are retryable post-commit
  coordination. Their typed failures are logged without duplicate success
  events or result rewriting.
- Exception-to-union conversion surrounds pre-commit operations only.
- Event payloads contain domain snapshots and public summaries only. The M4
  event/API implementation contains no `as any`, presentation fields, hidden
  prompts, private reasoning, or Chain-of-Thought fields.
- `store.ts` mutation preparation was split into `store-mutation.ts`.
  M4 Plan-domain production files are at or below 300 lines. The pre-existing
  integration hosts `harness.ts` and `harness-api.ts` remain legacy aggregate
  files and were not broadly refactored.

## Verification

- Targeted conflict, stale approval, event, and coordination fault tests:
  `8` files, `32` tests passed with one worker. The API/EventBus regression
  covers stale `verifyItem`, stale `requestReplan`, same-version stale semantic
  approval, exact replay, authoritative snapshots, and conflict/update counts.
- Plan/M3 regression plus Agent Plan binding: `35` files, `151` tests passed,
  `1` pre-existing fixture failure in
  `tests/application/plan/validation.test.ts:119`. The fixture omits the
  schema-required receipt `operation` field and therefore reaches TypeBox
  rejection before its expected custom error. The test, schema, and receipt
  type are unchanged from M3 commit `964cfb6`.
- `npm run typecheck`: passed.
- `npm run architecture:check`: passed with 0 migration baseline entries.
- `git diff --check`: passed.
- `./node_modules/.bin/openspec validate add-interactive-plan-mode --strict`:
  passed.
- M4 payload and type grep: no `as any` or prohibited presentation/private
  reasoning fields in the M4 implementation. Matches in tests are negative
  assertions.

## Review And Delivery

- Final independent read-only review approved M4 with P0/P1/P2 all at zero.
- Residual risk: exact replay does not separately assert the `plan:updated`
  count, but duplicate, version, and replay-first coverage exercises the core
  behavior.
- The user approved the M4 commit and entry into M5 through the confirmation
  dialog on 2026-08-27. No push, amend, rebase, or PR was authorized.
- Unrelated dirty and untracked files were left untouched.

## Acceptance

External review should verify:

1. Stale `verifyItem` and `requestReplan` return typed conflicts with the
   authoritative snapshot and each store CAS failure emits one
   `plan:conflict`.
2. A same-version stale revision/digest approval returns a typed conflict and
   emits one `plan:conflict`; exact command replay remains replay-first.
3. Replaying a pending interaction through the same adapter does not notify
   twice.
4. `verify_item` preserves the Main caller identity and rejects a SubAgent.
5. Approval and cancellation remain successful when cleanup fails, and retries
   return the same snapshot without duplicate success events.

Failure of any item above returns M4 to implementation. M5 remains pending.
