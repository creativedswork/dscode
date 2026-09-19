# M9 Status

Status: `AWAITING_ACCEPTANCE`

## Scope

M9 separates immutable Plan execution from Main-owned task progress, adds
outcome-oriented TODO state, closes incomplete intent alignment, and adds a
post-completion delivery report.

## Delivered

- `TaskState` is persisted in Main `AgentContext` and is independent of
  PlanRecord, PlanExecutionState, Runtime, transcript text, and UI state.
- `task_update` is Main-only, version checked, and supports initialization,
  editing, ordering, transitions, blockers, skipping, and reopening.
- `plan_start_item` requires an active same-Session TaskState whose
  `sourcePlan` identity exactly matches the approved Plan.
- Pending user-value requirements are persisted and cleared one at a time by
  actual human interactions. Compile and authorization reject unresolved
  requirements.
- Completed Plans retain Main, clear execution bindings, settle TaskState, and
  enter one report-only continuation that emits delivery, verification, and
  remaining-gap sections.
- Session rebinding restores the target Session's highest-version persisted
  TaskState into the current Main Process. A replacement Main therefore
  retains TODO state across application restarts.

## Real Acceptance

Result: `PASS`

- Project: `/tmp/dscode-m9-game-acceptance-4`
- Session: `00MU6P8Y789U83OBS6TONNA1CK`
- Plan: `plan-45ee1e2d-f11c-487d-a37b-af1cf3cb933d`
- The request fixed gameplay, desktop/mobile controls, offline behavior, and
  the allowed verification command while leaving delivery shape unresolved.
  Planning asked for that remaining user decision before execution.
- Main initialized exactly two outcome TODOs: core game playability and
  desktop/mobile controls. Files, implementation phases, commands, tests, and
  manual review did not become TODO items.
- Web showed the completed Plan, TODO `2/2`, and one final delivery report with
  delivered results, the actual `test -f index.html` verification, and explicit
  unverified gaps.
- The generated single-file game loaded at
  `http://localhost:8765/index.html` with two canvases, eight controls, a
  nonblank 240x480 board, no console errors, and a working START transition.
- A fresh built TUI restored the same Session in a 120x70 `tuistory` PTY and
  visibly rendered `执行计划 · 已完成`, `TODO · 2/2`, both outcome titles,
  their result summaries, and the persisted final report.

## Acceptance Fix

The first TUI restart exposed that each application start created a replacement
Main Process while the completed TaskState remained only in the earlier
persisted Main snapshot. Plan and transcript recovery succeeded, but
`getTaskState` observed the replacement Main's empty context.

`AgentSupervisor.updateParentSession` now selects the target Session's
highest-version TaskState from retained current context and persisted Main
snapshots, installs an immutable copy in the owning current Main, and persists
that context before projection. Other Sessions and SubAgent records are
ignored. Regression coverage also proves mutation can continue from the
restored version.

## Verification

- Final Plan, AgentProcess, TaskState, and TUI related suite: 54 files,
  280 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed, including architecture check and Web production
  build. Existing npm audit and bundle-size warnings remain.
- `git diff --check`: passed after documentation closeout.

## Remaining Boundary

The completion-report continuation tracker remains in memory. If the process
crashes after Plan and TaskState reach terminal state but before the visible
report is persisted, restart restores Plan/TODO but does not synthesize a
missing report. A durable report receipt remains a later enhancement.

No commit, push, archive, or prototype move has been performed.
