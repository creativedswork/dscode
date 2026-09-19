# M7 Status

Status: `ACCEPTED`

## Scope

M7 aligns the imperative TUI Chat with the existing shared Plan projection.
It keeps one Chat input, renders user-value alignment inline, renders one
collapsed global Plan before TODO, and restores only the selected Session's
state.

Explicit exclusions:

- M8 recovery, retention, serialization, and full integration work
- Web UI changes
- New dependencies
- Consolidate, prototype retention, commits, pushes, rebases, or staging

## Execution Checkpoint

EXECUTION_CHECKPOINT
- Closed at: 2026-09-05
- Milestone: M7 - TUI Chat native intent alignment
- Slice: TUI Plan projection and interaction
- Phase: closed
- Slice state: ACCEPTED
- Acceptance: the user explicitly accepted the previously presented M7 functional candidate by authorizing M8 implementation.
- Verification summary: TypeScript passed; 8 focused files and 101 tests passed; diff whitespace check passed; the deterministic keyboard/recovery harness passed; and the real PTY launch rendered successfully.
- Repository operations: no commit, push, pull, fetch, rebase, staging, or other remote operation was performed while closing this checkpoint.
- Continuity: all existing source, test, task, and documentation content remains unchanged except for this status record.
- Next action: M8 may start.
- Stop condition: M7 is accepted and this checkpoint is closed.

## Slice Report

SLICE_REPORT

- Added one inline `TuiPlanView` after live conversation content and before the existing permission prompt. It displays at most three value options, custom input guidance, one public Plan, and one TODO.
- Added a pure typed decision builder for `select` and `update_constraints`; it includes plan/version/interaction identity and payload digest and rejects cross-Session state.
- Routed arrows, Enter, Esc, Tab, and free text through the existing editor/input listener. Permission handling remains higher priority and no Plan approval control was added.
- Subscribed the TUI backend to committed Plan updates, interactions, and conflicts. Startup and Session replay load active-or-latest Plan state with Session and generation guards.
- Reused `planViewReducer` and `projectPublicPlan`; replan keeps the prior authorized projection until replacement, while clear/switch removes the old Session projection immediately.
- Removed the unused `getCapabilities` and `hyperlink` imports from `conversation.ts`.

## Milestone Report

MILESTONE_REPORT

- [x] 8.1 One existing Chat editor remains; no mode selector, page, panel, or Plan/Execution navigation was added.
- [x] 8.2 Inline value alignment supports arrows, recommended default, Enter selection, Esc focus return, and typed custom constraints.
- [x] 8.3 The public Plan is collapsed by default, toggles with Enter when focused, precedes the single TODO, survives replan, and is replaced rather than appended.
- [x] 8.4 TUI submits only decisions. Planner authorization remains internal and existing permission handling retains priority.
- [x] 8.5 Startup/replay synchronization restores pending or latest authorized state; clear and generation checks prevent stale Session projection.
- [x] 8.6 Reducer, command, keyboard, focus, rendering, narrow-width, backend event, and restore-race coverage is present.

## Verification

Focused tests:

```text
npx vitest run tests/ui/tui-plan.test.ts tests/ui/tui-plan-backend.test.ts tests/ui/permission-prompt.test.ts tests/ui/tui-agent-activity.test.ts tests/ui/plan-reducer.test.ts tests/ui/plan-projection.test.ts tests/ui/reducer.test.ts tests/ui/conversation-projectors.test.ts
Test Files  8 passed (8)
Tests       101 passed (101)
```

Type and diff checks:

```text
npx tsc --noEmit --pretty false
exit 0

git diff --check
exit 0
```

Interactive smoke:

```text
HOME="$PWD/.tmp/m7-smoke-home" npm start
```

- Observed in a real PTY: source CLI initialized, rendered `DSCode · DeepSeek V4 Flash`, welcome content, and one editable composer.
- `tuistory` was not installed. A provider-free real process could not safely receive a Plan fixture, so arrow/Enter/Esc/Tab, custom submission, collapse/expand, event filtering, and Session restore were exercised with deterministic `TuiApp` key-byte and backend harness tests.
- The isolated run was terminated after observation; PIDs `52637` and `52660` are no longer present and `.tmp/m7-smoke-home` was removed.
- Full test suite, repository build, M8 checks, consolidate, and commit were intentionally not run.

## Acceptance Steps

1. Start the TUI against a backend Session containing a pending decision.
   - Expected: one inline question appears with no Plan page or mode selector; at most three options plus `自定义方向` are visible.
   - Failure: a separate planning surface appears, options duplicate, or the normal permission UI is replaced.
2. Press Up/Down, Enter, and Esc on the alignment.
   - Expected: selection wraps, Enter submits one typed response, Esc returns to Chat input, and Tab restores alignment focus.
   - Failure: a chat message is sent for a suggested option, focus is trapped, or repeated Enter submits while busy.
3. Choose `自定义方向`, enter text, and press Enter.
   - Expected: the text becomes an `update_constraints` decision; empty text is ignored and a failed mutation restores the draft.
   - Failure: custom text enters the model transcript as an ordinary request or disappears after failure.
4. Attach to an authorized or executing Plan and press Tab then Enter.
   - Expected: one collapsed `执行计划` appears before one `TODO`; Enter expands goal, constraints, selected approach, scope, steps, and verification.
   - Failure: internal IDs/digest/evidence appear, width overflows, or Plan/TODO order or uniqueness changes.
5. Trigger replanning and then authorization of a new revision.
   - Expected: the last authorized Plan remains during drafting and is atomically replaced, collapsed, after authorization.
   - Failure: a second Plan/TODO is appended or drafting internals replace the authorized output.
6. Switch from a Session with pending/authorized Plan state to one without it, then switch back.
   - Expected: old state clears immediately; only the selected Session's pending alignment or latest authorized/terminal Plan returns once.
   - Failure: stale alignment, Plan, TODO, selection, or expansion state leaks across Sessions.
