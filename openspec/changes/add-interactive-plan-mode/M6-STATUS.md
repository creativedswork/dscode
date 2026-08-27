# M6 Status

Status: `AWAITING_USER_DEBUG_CONFIRMATION`

## Outcome

Revised M6 tasks 7.1-7.9 are implemented and have passed the milestone-focused
self-test. Planning remains an internal Agent mechanism. The Web product exposes
only durable user-value alignment in the existing Chat flow, while protected
side effects continue through the existing permission interaction.

User acceptance has not yet been granted.

## Creative Intent Routing Fix

The accepted M6 UI smoke injected an existing pending interaction and did not
exercise autonomous routing. A real user report showed that
`创建一个俄罗斯方块小游戏` executed directly without visual-style alignment.

Pre-fix deterministic evidence used the exact request with
`intentUncertainty: 2` and all operational dimensions `0`: the route was
`direct`, the guard returned Main, and no Planner or pending interaction was
created. The live TUI accepted the request but could not reach model inference
because the local `deepseek` provider is not configured.

The route contract now treats any remaining user-intent uncertainty as an
independent Planner trigger. This absorbs provider scoring variance between
levels `1` and `2` without hard-coding a domain or example request. A request
that explicitly specifies visual style, board, controls, and HUD remains
Direct, and `solutionDivergence: 2` alone also remains Direct so technical
alternatives stay autonomous.

The final live `deepseek-v4-pro` run used the exact request in an empty isolated
project. Main scored `intentUncertainty: 1`, the Host deterministically selected
Plan, Planner received the public assessment, and the Web Chat displayed:

```text
你希望这个俄罗斯方块小游戏采用哪种视觉主题/配色风格？
```

The inline interaction offered three user-facing visual directions plus custom
input. No route assessment, `skill`, `list_agents`, or `plan_*` tool card was
shown, and the project remained empty before the user decision.

A later Workbuddy run exposed the remaining zero-score case: the provider
explicitly treated canonical genre visuals as sufficient and returned
`intentUncertainty: 0`. The Host now applies a minimum score of `1` to
user-visible creation requests without an explicit visual direction, including
short briefs without a creation verb. The rebuilt `dist/dscode.mjs` was started
against Workbuddy and the exact short request `俄罗斯方块小游戏` produced an inline
visual-and-interaction question with three options and custom input.

The Workbuddy follow-up `保龄球游戏` exposed a handoff-only UI gap: Main emitted
`processing:stop` after Planner had started, restoring an idle composer while
Planner was still generating the question. Web now preserves a generic
processing state and Stop during foreground Planner ownership, without
projecting Planner tools. Chat inserts an `进入 Planning Mode` timeline marker,
shows `Waiting...` immediately after a Plan route is known, shows
`正在规划下一步...` while Planner runs, and shows `等待你选择方向...` while an
inline choice is pending, keeping the main composer non-submittable throughout.
Empty streaming responses no longer render a blank `Response` phase. The
Waiting timer uses a local one-second clock above the latest Session-time
baseline so it continues advancing after Main hands foreground ownership to
Planner.

Focused verification:

```text
8 test files passed
81 tests passed
npm run typecheck: passed
git diff --check: passed
```

Debug instrumentation and `.dbg` evidence remain uncommitted until the user
confirms Fixed or Abort.

## Slice Ledger

### A — Remove rejected surface

Commit: `f1edd05 refactor(plan): remove standalone plan workbench`

Committed files:

- `web/src/components/App.tsx`
- `openspec/changes/add-interactive-plan-mode/tasks.md`

The rejected untracked `PlanDecisionPanel.tsx`, `PlanProgressPanel.tsx`,
`PlanWorkbench.tsx`, `planWorkbench.ts`, and `plan-workbench.test.ts` candidates
were removed. `MessageInput.tsx` and `index.css` were restored to their existing
single-Chat-input state and therefore had no committed diff. M5 protocol and
reducer behavior was retained.

Basic check: targeted diff review and `git diff --check`.

### B — Autonomy and internal authorization

Commit: `4939dec feat(plan): make planning autonomous`

Files:

- `src/application/plan/planner-application.ts`
- `src/application/plan/planner-policy.ts`
- `src/application/plan/planner-process.ts`
- `src/application/plan/planner-service.ts`
- `src/application/plan/planner-spawn.ts`
- `src/application/plan/planner-tools.ts`
- `src/application/plan/planner-types.ts`
- `tests/application/plan/planner-invariants.test.ts`
- `tests/application/plan/planner-tools.test.ts`

The Planner now owns technical selection, investigation, backtracking, and
replanning. Only missing user-value judgments can create durable interaction.
Whole-Plan approval is replaced by internal authorization of the exact revision
and digest; the existing permission policy remains authoritative.

Basic check: focused Planner tests and diff validation.

### C — Chat-native alignment

Commit: `f1876a2 feat(plan): add chat-native intent alignment`

Files:

- `src/application/plan/planner-actions.ts`
- `src/ui/shared/plan-reducer.ts`
- `tests/application/plan/planner-invariants.test.ts`
- `tests/ui/intent-alignment.test.ts`
- `tests/ui/plan-reducer.test.ts`
- `web/src/components/App.tsx`
- `web/src/components/ChatView.tsx`
- `web/src/components/IntentAlignment.tsx`
- `web/src/index.css`
- `web/src/utils/intentAlignment.ts`

Only the current decision interaction is projected inline. Selected and custom
answers use typed idempotent commands and become explicit user constraints.
Internal Plan data does not enter `UIMessage[]` or the visible transcript.

Basic check: focused reducer/component tests and diff validation.

### D — Milestone self-test and fixes

Commits:

- `09659a2 fix(plan): preserve autonomous replanning`
- `dc356e5 fix(web): restore alignment across session switches`

Files:

- `src/application/plan/planner-policy.ts`
- `tests/application/plan/plan-service.test.ts`
- `tests/application/plan/planner-invariants.test.ts`
- `tests/application/plan/planner-tools.test.ts`
- `tests/ui/plan-reducer.test.ts`
- `web/src/components/App.tsx`
- `web/src/components/Sidebar.tsx`

The fixes keep backtracking and non-user constraint updates autonomous, align
fixtures with the user-value policy, clear stale reducer interactions, and allow
Session loading while an alignment is actionable without disabling Stop or
loosening New Session/delete behavior.

## Self-Test Evidence

Focused Vitest result:

```text
8 test files passed
57 tests passed
Duration 6.11s
```

Covered Plan service, Planner policy/tools, protocol, reducer, Chat alignment,
Session switching, and existing conversation reducer behavior.

Real React/Vite app smoke used a deterministic WebSocket fixture and Chrome:

- underspecified `创建一个俄罗斯方块小游戏` produced one inline visual-direction
  alignment with three understandable options and a recommendation;
- keyboard selection, pointer selection, and custom text submission completed;
- a fully specified Tetris request bypassed the style question;
- protected write behavior used the existing permission prompt without a
  whole-Plan approval;
- reconnect restored exactly one pending alignment;
- Session A/B/A switching produced alignment counts `1 -> 0 -> 1`, cleared stale
  processing state, and re-enabled the target Session input;
- light and dark themes were exercised;
- `1440x900`, `390x844`, and `1080x322` had no document-level horizontal
  overflow;
- browser console errors were empty.

Smoke screenshots:

- `/tmp/m6-alignment-1440x900.png`
- `/tmp/m6-permission-1440x900.png`
- `/tmp/m6-alignment-390x844.png`
- `/tmp/m6-alignment-1080x322.png`
- `/tmp/m6-session-restore-1080x322.png`

Chrome reported sandbox-denied writes to its external Crashpad/Application
Support files after assertions completed. This did not affect the app, fixture,
screenshots, or browser assertions.

## Time Magnitude

- Development and slice fixes: tens of minutes.
- Focused tests and browser self-test: tens of minutes.
- Full release hardening: deferred by milestone policy.

## Release Hardening

Run as the separate user gate, not as part of this fast M6 loop:

```bash
npm run typecheck
npm run build
npm test
npm run architecture:check
```

Also perform final code/security review and repeat browser acceptance against a
configured model backend after any routing-policy change.

Deferred risks:

- broad cross-feature TypeScript/build/test regressions have not been excluded;
- provider scoring remains variable, so the Host treats every non-zero
  user-intent uncertainty score as an alignment trigger;
- restart reconciliation, TUI parity, and serialization hardening belong to
  M7/M8.

## Exclusions

- No push, PR, amend, or rebase.
- No M7 TUI implementation.
- No M8 recovery/security/integration work.
- No unrelated dirty or untracked files were staged or reverted.

## Prototype Retention

`docs/prototypes/add-interactive-plan-mode-chat-alignment.html` remains
`pending`. Final archive/delete handling is deferred until M7, M8, and the
overall change are complete.

## Manual Acceptance

1. Start the Web app with a configured model.
2. Submit `创建一个俄罗斯方块小游戏` and confirm one inline value question appears.
3. Exercise one option and one custom answer; confirm execution resumes without
   showing Plan internals.
4. Submit a fully specified visual request and confirm no redundant style
   question appears.
5. Trigger a protected write and confirm only the existing permission UI is
   shown.
6. Reconnect and switch Sessions while alignment is pending; confirm one restore
   and stale-state cleanup.
7. Check keyboard, pointer, light/dark, `1440x900`, `390x844`, and `1080x322`.

The next transition requires explicit user acceptance.
