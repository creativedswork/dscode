## Prototype Files

- [`docs/prototypes/redesign-plan-executive-loop-execution-state.html`](../../../docs/prototypes/redesign-plan-executive-loop-execution-state.html)
  - Chat-native interactive prototype for `running`, `reflecting`,
    `paused_inconclusive`, and `completed` execution states.
  - Confirms that Plan, outcome-owned TODO, and episode state remain separate in the
    conversation hierarchy.
  - Confirms that paused work is labeled `未验证`, retains the `0/2` outcome count,
    and offers `调整方案` and `继续执行` without presenting failure or completion.
  - Reuses the existing warm light/dark design language, restrained borders, compact
    density, and responsive stacked actions on narrow viewports.

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/redesign-plan-executive-loop-execution-state.html` | `archive` | Defines the reusable four-state Plan/TODO/episode interaction contract, matches the final Web/TUI implementation and current design tokens, and remains executable evidence for visual regression and design review. Move it during OpenSpec archive. |

## Confirmed Decisions

- Execution supervision appears inside the existing Chat flow rather than as a new
  dashboard or mode.
- Reflection is a temporary execution state, not a visible Critic Agent.
- A paused episode retains the same Plan and TODO rows and explicitly distinguishes
  unverified work from failure.
- Recovery uses two direct commands: adjust the approach or continue with a fresh
  bounded episode.
- Completion is shown only after the persisted outcome count reaches the required
  total.

## Validation

- Exercised all four state selectors in a browser.
- Exercised light and dark themes.
- Compared the final React projection with the prototype at desktop and mobile
  widths in light and dark themes.
- Verified keyboard focus, accessible action names, no text overlap, and no
  horizontal overflow.
- Verified no browser console errors during interaction.

## Delivery Record

- Delivered bounded execution episodes, semantic progress and action
  fingerprinting, one reflection attempt, inconclusive pause, explicit recovery,
  bounded evidence retention, and matching Web/TUI projections.
- Verified focused Plan and UI suites, the complete test suite, typecheck,
  production build, lockfile registry consistency, and strict OpenSpec validation.
- A live provider-backed long-running incident was not replayed because it
  requires external credentials; the sanitized deterministic fixture covers the
  observed repetition, pause, state preservation, and recovery paths.
