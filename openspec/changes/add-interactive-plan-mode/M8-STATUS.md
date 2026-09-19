# M8 Status

Status: `AWAITING_ACCEPTANCE`

## Scope

M8 completes recovery reconciliation, private-reasoning serialization
boundaries, terminal Plan retention, repository-wide verification, capability
acceptance, prototype retention, and OpenSpec consolidation.

Explicit exclusions:

- Changes outside tasks 9.1-9.12
- Reverting or overwriting existing M6, M7, or user changes
- Git staging, commits, pushes, pulls, fetches, rebases, or change archival
- New frameworks or dependencies

## Slice A Report

SLICE_REPORT

- Completed result: startup and Session restore now reconcile the active
  PlanStore record with the current AgentSupervisor table. Missing planning
  processes restart idempotently, persisted decisions are reissued once per
  interaction adapter, and execution resumes only from an exact persisted Main
  item binding.
- Safety result: an `approved` or `executing` Plan without an exact Main
  `planId`, revision, digest, item, role, and binding timestamp match is
  atomically moved through `needs_replan`; approval and every execution binding
  are cleared before a recovery Planner starts.
- Modified files:
  `src/application/plan/plan-recovery.ts`,
  `src/application/plan/plan-service.ts`,
  `src/application/plan/planner-spawn.ts`,
  `src/application/plan/planner-process.ts`,
  `src/application/plan/execution-state.ts`,
  `src/application/plan/execution-service.ts`,
  `src/application/plan/index.ts`,
  `src/application/harness.ts`, and
  `tests/application/plan/recovery.test.ts`.
- Basic checks: `npx tsc --noEmit --pretty false` passed. Six focused test
  files passed with 41/41 tests. Slice-owned `git diff --check` passed.

## Slice B Report

SLICE_REPORT

- Completed result: strict PlanRecord validation rejects private-reasoning
  fields before persistence; one cross-boundary test follows an accepted
  snapshot through domain events, WebSocket broadcast, and the public UI
  projection.
- Retention result: `plan.terminalRecoveryTtlMs` is loaded from project/user
  settings or `DSCODE_PLAN_TERMINAL_RECOVERY_TTL_MS`, with a 30-day default.
  Startup and project switches prune only expired `completed`, `cancelled`, or
  `failed` Plan files under a per-Plan lock after a fresh version/status check.
  Active Plans and individual command receipts are never TTL-pruned.
- Modified files:
  `src/application/plan/store.ts`,
  `src/application/plan/plan-retention.ts`,
  `src/application/plan/plan-service.ts`,
  `src/application/plan/index.ts`,
  `src/config/types.ts`,
  `src/config/loader.ts`,
  `src/application/project-coordinator.ts`,
  `src/application/harness.ts`,
  `tests/application/plan/retention.test.ts`,
  `tests/application/plan/serialization-boundaries.test.ts`,
  `tests/config/loader.test.ts`,
  `tests/config/settings-service.test.ts`, and
  `tests/helpers/routed-harness.ts`.
- Basic checks: `npx tsc --noEmit --pretty false` passed. Four focused files
  passed with 20/20 tests after correcting one backward-compatible
  RuntimeConfig fallback. Slice-owned `git diff --check` passed.

## Slice C Report

SLICE_REPORT

- Completed result: task 9.5 is checked from retained logs. Focused Vitest
  passed 58 files and 352/352 tests; typecheck and architecture checks passed.
  The full suite passed 142 files and 1098 tests with one live test skipped,
  except for one parallel `removed-paths` timeout whose single-worker rerun
  passed 2/2 tests.
- Capability result: every task 9.6 capability has deterministic integration
  coverage in the focused suite. The TUI also launched in a real PTY under a
  10-second timeout and rendered the normal header, welcome content, and one
  editable composer.
- Browser result: task 9.6 is checked. A fresh isolated real Web run passed the
  critical internal-Plan path, Chat-native alignment, default-collapsed Plan
  output before TODO, existing write/process permission flow, ordinary scope
  denial without replan, completion, reload recovery, and cold restart
  recovery.
- Coverage boundary: autonomous Direct, failure, cancellation, material
  replan, and TUI keyboard/focus behavior remain covered by deterministic
  integration tests and TUI PTY evidence rather than this Browser run.

## Capability Scenario Matrix

| Capability | Deterministic evidence | Result |
|---|---|---|
| Autonomous Direct and internal Plan routing | `route.test.ts`, `harness-routing.test.ts`, `harness-routing-boundary.test.ts` | Automated PASS |
| Chat-native intent alignment | `planner-service.test.ts`, `intent-alignment.test.ts`, `plan-protocol.test.ts` | Automated PASS; actual Web PASS |
| Collapsed global Plan output and Plan/TODO separation | `plan-projection.test.ts`, `plan-reducer.test.ts`, `intent-alignment.test.ts`, `tui-plan.test.ts` | Automated PASS; actual Web PASS |
| Autonomous technical-path selection | `route.test.ts`, `planner-tools.test.ts`, `planner-service.test.ts` | Automated PASS; actual Web PASS |
| Internal execution binding and ordered execution | `plan-binding.test.ts`, `execution-acceptance.test.ts`, `harness-plan-continuation.test.ts` | Automated PASS; actual Web PASS |
| Effect and resource-scope expansion blocking | `execution-guard.test.ts`, `resource-scope.test.ts` | Automated PASS; actual Web ordinary scope-denial PASS |
| Existing permission interaction | `execution-guard.test.ts`, `intent-alignment.test.ts`, `permission-prompt.test.ts` | Automated PASS; actual Web PASS |
| Execution and verification | `execution-command-acceptance.test.ts`, `execution-evidence-binding.test.ts`, `harness-execution.test.ts` | Automated PASS; actual Web PASS |
| Cancellation | `execution-cancellation.test.ts`, `execution-state.test.ts`, `harness-planner-exit.test.ts` | Automated PASS |
| Failure terminal state | `harness-planner-exit.test.ts`, `plan-reducer.test.ts`, `reducer.test.ts` | Automated PASS |
| Replanning | `execution-state.test.ts`, `planner-lifecycle.test.ts`, `plan-reducer.test.ts`, `plan-protocol.test.ts` | Automated material-replan PASS; actual Web ordinary scope denial correctly did not replan |
| Restart and conservative recovery | `recovery.test.ts`, `plan-service.test.ts`, `plan-protocol.test.ts`, `tui-plan-backend.test.ts` | Automated PASS; actual Web reload and cold restart PASS |
| Web/TUI projection consistency | `conversation-projectors.test.ts`, Web/TUI projection tests, bounded real PTY smoke | Automated PASS, actual Web PASS, and TUI launch PASS |

The matrix combines deterministic coverage with a real Browser run. The
Browser run intentionally does not duplicate deterministic failure,
cancellation, material-replan, Direct, or TUI keyboard/focus cases.

## Acceptance Fix Report

SLICE_REPORT

- User acceptance exposed that a malformed command criterion,
  `grep -q "-webkit-backdrop-filter" ...`, could fail even when the required
  content existed, after which Main could submit a summary-only
  `plan_report_conflict` and incorrectly move the Plan to `needs_replan`.
- Plan compilation now rejects `grep` acceptance commands unless the pattern
  is separated with `--` or supplied by `-e/--regexp`, so this class of
  option-parsing error cannot reach authorized execution.
- `plan_report_conflict` now requires the current Main, revision, digest,
  in-progress item, exact item binding, a real hard constraint or selected
  decision, and successful objective Tool evidence from that item. Failed or
  unknown Tool results, permission denial, Agent progress, and summary-only
  reports are rejected without changing status, revision, digest, approval,
  or binding. Explicit user `requestReplan` remains a separate compatibility
  path.
- Focused regression verification passed 7 files and 41/41 tests, including
  the exact leading-hyphen grep form, failed acceptance evidence, permission
  denial, valid material conflict, and explicit user replan. TypeScript passed.

### Agent-owned TODO Fix

- User acceptance exposed a persisted two-item Plan whose first item generated
  the game and whose second item was a human-only browser review. The second
  item became a blocked TODO even though it was user-operated validation.
- The initial human-only guard was insufficient because a final item could
  still mix command smoke checks with a human visual criterion. Plan
  compilation now rejects any new `human` criterion, alone or mixed.
- Planner instructions require every TODO to be completable by Main; unavailable
  manual observation is reported after completion as an evidence gap.
- This intermediate fix still allowed separate implementation and verification
  phases as TODOs; the deliverable-owned redesign below supersedes that rule.

### Deliverable-owned TODO and Host Acceptance Fix

- Runtime evidence from
  `plan-bd4b3cf3-3b3e-446f-a755-973dff4c0612.json` showed one `index.html`
  split into four TODOs. The third item's five criteria all had repeated
  exit-code-0 evidence, but Main never called `verify_item`; the Host exhausted
  its continuation budget, marked the item blocked, and left the fourth item
  pending.
- PlanItem now means an independently user-visible deliverable. Compilation
  rejects items sharing a canonical workspace-write scope and read-only items
  that only verify a dependency's output. Smoke/test commands belong to the
  producing item's acceptance criteria.
- Main Tool evidence is reconciled by Host as it is persisted. When all
  command/observable criteria pass, Host atomically completes the item and,
  when applicable, the Plan. `verify_item` is removed from the Main tool
  surface and retained only as a compatibility API.
- Pre-fix trace showed successful evidence followed by continuation-budget
  blocking; post-fix trace showed the same evidence immediately producing Host
  completion with no stall or blocked transition. Focused verification passed
  6 files and 39/39 tests.
- A final boundary review removed stale continuation guidance that still told
  Main to call `verify_item`. The compatibility API now also rejects an
  explicitly unknown evidence ID instead of falling back to unrelated current
  evidence.
- The complete Plan domain suite passes 38 files and 190/190 tests. TypeScript,
  architecture validation, strict OpenSpec validation, and scoped
  `git diff --check` pass.
- Existing persisted blocked or terminal Plans remain immutable audit history
  and are not rewritten into the new item shape. Real acceptance must use a new
  Session and a newly compiled single-deliverable request.
- Recommendation-label evidence showed the screenshot's persisted decision had
  three `recommended: false` candidates, while shared projection and Web
  rendering preserved that data correctly. Planner decision persistence now
  requires exactly one recommendation; zero or multiple recommendations are
  rejected before any Web/TUI interaction is emitted. Post-fix instrumentation
  proves invalid input does not reach projection and valid input retains one
  recommendation end to end. A newly compiled real Web Plan then showed the
  recommendation sentence, checked recommended option, and visible `推荐`
  label; user visual confirmation is pending before debug cleanup.

## Real Browser Acceptance

Result: `PASS`

- Run isolation: project `.tmp/m8-browser-run2-project`; HOME
  `.tmp/m8-browser-run2-home`; initial port `4322`; cold restart on `4323`
  with the same HOME. All test processes were stopped after acceptance.
- Browser View connected and displayed `Connected`.
- Submitting `创建一个俄罗斯方块小游戏` caused Main to run only
  `list_files` before `进入 Planning Mode`; no side effect occurred first.
- Chat showed three user-understandable options plus custom input. Selecting
  the recommended single-HTML direction created exactly one `已确认` user
  timeline entry.
- Planner autonomously selected the technical path and produced
  `计划已生成 · 1 项任务`. `执行计划 1 项任务 · 执行中`
  appeared before `TODO 执行中 · 0/1`.
- The Plan disclosure reported `details.open === false`. Opening it showed
  goal, constraints, selected approach, scope, execution steps, and
  verification.
- The existing `write_file` `Permission Required` card appeared; `Allow`
  wrote `index.html` in the isolated project. The existing `bash` permission
  then appeared; `Always Allow` in the isolated HOME permitted each acceptance
  command to run separately.
- An additional unauthorized `node -e ...` returned
  `Plan side effect blocked: scope_mismatch: Resource is outside Plan approval`.
  It did not trigger replanning. Final PlanStore state was
  `status=completed`, `revision=7`, no `baseRevision`; TODO was
  `1/1 已完成`.
- Reload restored one terminal Plan/TODO. After the cold restart, Sessions
  listed the old Session and switching back restored
  `执行计划 1 项任务 · 已完成` plus `TODO 执行完成 · 1/1`;
  `details.open === false` remained true.
- Browser console contained only one intentional-navigation
  `net::ERR_ABORTED` and no application JavaScript exception.
- The real viewport was `770x588`. Mobile and `1080x322` acceptance continues
  to rely on the M6 prototype/browser run plus deterministic responsive tests.
  Earlier M8 `Reconnecting...` screenshots are not counted as success.

Detailed sanitized evidence:
`.tmp/m8-evidence/browser-acceptance.md`.

## Prototype Retention

- `docs/prototypes/add-interactive-plan-mode-chat-alignment.html`: `archive`.
  It matches the final Chat-native interaction and remains in staging until
  change archival.
- `docs/prototypes/add-interactive-plan-mode-workbench.html`: `delete`. The
  rejected workbench HTML was removed. No README index entry existed to
  remove, and the remaining reference is the final retention record.
- Tasks 9.7 through 9.12 are checked. All 93 tasks are now checked; OpenSpec consolidation is
  complete in `consolidate.md`.

## Closeout Verification

- OpenSpec apply status: `92/92`, state `all_done`.
- Consolidation: generated
  `openspec/changes/add-interactive-plan-mode/consolidate.md` from the returned
  template after scanning related archived proposals.
- Strict validation:
  `./node_modules/.bin/openspec validate add-interactive-plan-mode --strict`
  PASS.
- M8/documentation-scope `git diff --check`: PASS.
- The acceptance Fix modified only the Plan compiler, execution/replan domain
  path, execution prompts, and their focused tests; no UI or unrelated runtime
  behavior changed.
- No file was staged or committed; no remote operation or change archival was
  performed.

## Closed Execution Checkpoint

EXECUTION_CHECKPOINT
- Updated at: 2026-09-06
- Milestone: M8 - Recovery, safety, and integration acceptance
- Slice: M8 acceptance Fix - deliverable-owned TODO and Host acceptance
- Final Phase: targeted-verification
- Slice state: IMPLEMENTED; no commit created because the user explicitly prohibited staging and commits.
- Completed facts: tasks 9.1-9.12 are checked; OpenSpec reports 93/93 and `all_done`; deterministic integration coverage passes; the bounded real TUI PTY launch passes; the isolated real Browser acceptance passes; execution-incident replan, deliverable-owned TODO, Host acceptance, and unique-recommendation regressions pass; prototype retention and consolidation are complete.
- Repository state: branch `feat/0.3.2`, HEAD `2a308e4`; no staged files were observed; the worktree contains existing M6, M7, M8, and user changes.
- Explicit exclusions: preserve all existing dirty content; do not stage, commit, archive the OpenSpec change, or perform remote operations.
- Verification summary: focused M8 Vitest 58 files and 352/352 tests PASS; the execution-incident Fix suite passed 7 files and 41/41 tests; the deliverable-owned TODO/Host acceptance Fix passed 6 files and 39/39 tests; the final Plan plus Web/TUI alignment suite passed 40 files and 209/209 tests, including rejection of zero or multiple recommendations; `npm run typecheck` PASS; `npm test` recorded 142 files and 1098 tests passing, 1 live test skipped, and 1 file timed out; that file passed 2/2 tests in a single-worker rerun; architecture check PASS; bounded TUI PTY launch PASS; prior real Browser acceptance PASS; OpenSpec strict validation PASS; M8/documentation-scope `git diff --check` PASS.
- Retained evidence paths: `.tmp/m8-evidence/focused-vitest.log`; `.tmp/m8-evidence/typecheck.log`; `.tmp/m8-evidence/npm-test.log`; `.tmp/m8-evidence/removed-paths-single-worker.log`; `.tmp/m8-evidence/architecture-check.log`; `.tmp/m8-evidence/tui-pty-smoke.log`; `.tmp/m8-evidence/browser-acceptance.md`; `openspec/changes/add-interactive-plan-mode/consolidate.md`. The acceptance Fix was revalidated directly with the 7-file focused Vitest command, TypeScript, architecture check, strict OpenSpec validation, and scoped diff check.
- Remaining Release Hardening items: real Web acceptance of a newly compiled
  single-deliverable Plan is pending. The prior full-suite parallel
  `removed-paths` timeout remains documented with its passing 2/2 single-worker
  rerun.
- Final run identity: isolated Browser project `.tmp/m8-browser-run2-project`, HOME `.tmp/m8-browser-run2-home`, port `4322`, then cold restart port `4323`; all test processes are stopped.
- Blockers and risks: no deterministic gate is failing. `tuistory` remains
  unavailable, so TUI interaction is represented by deterministic
  key-byte/backend harness tests plus the bounded real PTY launch.
- Next action: restart the latest Web backend, create a new Session, and submit
  a single-file page or game request. Confirm that one deliverable produces one
  TODO and successful persisted acceptance completes it without
  `verify_item`, continuation stalls, or `blocked`. Keep the
  `plan-todo-blocked` debug server and instrumentation until explicit user
  confirmation; do not archive, stage, commit, push, or begin another
  milestone.
