## Prototype Files

- `docs/prototypes/archive/2026-08-05-show-eval-dashboard-in-webui/show-eval-dashboard-in-webui-embedded-report.html` — WebUI shell with shell-level `Chat / Dashboard / Eval` navigation and an Eval-only main area containing an embedded sandbox-style CHIEF report. Confirmed decisions:
  - Eval owns the entire main content area; the prototype no longer mocks or explains Chat and Session Dashboard content inside Eval.
  - Chat / Dashboard / Eval controls always remain visible. Clicking Eval with no state or a Completed/Failed/cached report sends the standard `/eval` slash command for a new current-Session run. Only Starting/Running is reopened without starting a concurrent duplicate.
  - Session Dashboard is disabled while Eval is active; users must return to a non-empty Chat view before entering it, and stale Chat → Dashboard transitions cannot override Eval.
  - WebUI prompt 提交 `/eval` 后立即进入 `Starting` preparation state，不等待 Session load 或首个 CHIEF worker。
  - 长时间 `Running` state 显示 elapsed time、target/run、actor/Step/evidence、七阶段进度、active worker 短 ID 和 retry attempt。
  - Starting、Running 和 Failed lifecycle surfaces 使用与 ChatView 相同的 16px gutter，占满可用主区域宽高，不再受 610px 居中卡片限制。
  - Eval is a dedicated read-only view rather than the mutable Session Dashboard.
  - The toolbar always shows target Session, run ID, evidence summary, lifecycle status and explicit external-open action.
  - Running state exposes seven CHIEF stages; failed state identifies the stop and automatically displays only the same target Session's latest complete report with distinct failed/history run IDs, or a blank failure surface when none exists; completed state dedicates the main area to the report iframe.
  - Completed and failed-history report iframes fill the remaining height between Eval chrome elements; long reports scroll inside the iframe without exposing an outer blank region.
  - Eval mode removes MessageInput and displays a read-only footer, preventing accidental `artifact update`.
  - The shell uses the current light/dark warm-design tokens, 38px top bar, 8px panels, 6px controls, 1px borders, and no gradients.
  - Responsive rules retain all three view controls while collapsing the Session sidebar and non-essential toolbar labels below 768px.

## Validation

- Browser-loaded from the repository through a local HTTP server.
- Verified the Eval-only main area does not contain the previous Chat/Session Dashboard placeholders.
- Verified `Starting`, `Running`, `Complete`, and `Failed` Eval states.
- Verified Starting hides unavailable run identity and Running advances the elapsed timer.
- Verified the selector dispatches `/eval` from both empty and preloaded Completed states, while Starting/Running selection does not dispatch a duplicate.
- Verified Dashboard is disabled in Eval and remains reachable from a non-empty Chat view only.
- Verified Starting, Running and Failed lifecycle surfaces fill the available Chat main area within the standard gutter.
- Verified completed report rendering inside the iframe, same-target historical fallback in Failed, and no cross-target fallback.
- Verified the report iframe occupies the full remaining Eval content height rather than its intrinsic default height.
- Verified light/dark theme switching and captured full-page screenshots for running, failed and completed states.
- Browser console showed no prototype JavaScript exception; the only observed message was a navigation-aborted request produced by the automation tool reloading the same URL.

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/archive/2026-08-05-show-eval-dashboard-in-webui/show-eval-dashboard-in-webui-embedded-report.html` | `archive` | 定义 Eval 独占主区域、完整生命周期、历史回退和响应式布局的可执行 UI 契约，主 Spec 与后续评审仍需引用。 |
