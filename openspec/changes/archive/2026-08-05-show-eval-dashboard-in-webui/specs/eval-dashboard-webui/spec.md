## ADDED Requirements

### Requirement: WebUI projects Eval lifecycle into a dedicated view

The WebUI SHALL project CHIEF Eval lifecycle events into an `eval_dashboard` view that is distinct from Chat and the generated Session Dashboard. Submitting `/eval` through the WebUI prompt SHALL switch to this view immediately, before Session loading or CHIEF analysis completes. The Eval main area SHALL contain only Eval preparation, execution, report or failure content.

#### Scenario: WebUI prompt submits eval command

- **WHEN** the user submits `/eval` or `/eval <session-id>` through WebUI MessageInput
- **THEN** the server SHALL publish a starting Eval Dashboard event before its first asynchronous Session read
- **AND** WebUI SHALL immediately set `viewMode` to `eval_dashboard`
- **AND** SHALL display a preparation state instead of continuing to show command-line-style progress in Chat

#### Scenario: WebUI Eval selector starts evaluation

- **WHEN** no Eval is in flight and the user selects Eval in the Header
- **THEN** WebUI SHALL submit the same `/eval` slash command used by MessageInput
- **AND** the server SHALL publish the same starting/running/completed/failed lifecycle
- **AND** WebUI SHALL enter Eval mode on starting without requiring the user to type the command

#### Scenario: Cached report does not suppress selector evaluation

- **WHEN** a completed report is displayed or restored from Eval cache and the user selects Eval
- **THEN** WebUI SHALL submit `/eval` for the current Session
- **AND** SHALL retain the completed report in cache while the new lifecycle replaces the active presentation

#### Scenario: Eval run starts from WebUI

- **WHEN** `/eval` subsequently freezes its target Session and creates an Eval run
- **THEN** WebUI SHALL make the Eval view available
- **AND** replace preparation with the Eval running state
- **AND** display the target Session short ID and run ID

#### Scenario: Historical Session is evaluated

- **WHEN** the current WebUI Session is B and `/eval <session-A>` evaluates historical Session A
- **THEN** the Eval view SHALL identify A as the report target
- **AND** WebUI SHALL NOT switch the active chat Session from B to A
- **AND** Eval HTML SHALL NOT be added to B's conversation

#### Scenario: Stale run event arrives

- **WHEN** Eval run B is active in the view and a lifecycle event for older run A arrives
- **THEN** the event for A SHALL NOT replace B's active running, failure or completed presentation

### Requirement: Completed Eval HTML is rendered without regeneration

On successful completion, WebUI SHALL render the exact coordinator-generated HTML through the existing sandboxed ArtifactContainer iframe. Displaying the report SHALL NOT invoke an additional LLM call.

#### Scenario: Eval completes successfully

- **WHEN** WebUI receives a completed Eval Dashboard event containing validated HTML
- **THEN** it SHALL render that HTML with `iframe.srcDoc`
- **AND** the iframe sandbox SHALL include `allow-same-origin`
- **AND** the iframe sandbox SHALL NOT include `allow-scripts`
- **AND** the iframe SHALL fill the remaining Eval area between the toolbar and read-only footer
- **AND** long report content SHALL scroll inside the iframe instead of exposing unused outer-page space
- **AND** no `artifact generate` command SHALL be sent

#### Scenario: Explicit external open

- **WHEN** the user chooses "Open" from a completed Eval view
- **THEN** WebUI SHALL open the already received HTML through a browser Blob URL
- **AND** SHALL NOT request or expose an arbitrary server filesystem path

### Requirement: Eval Dashboard is read-only

The Eval view SHALL be read-only. It SHALL NOT expose Session Dashboard HTML modification semantics or route user input to an `artifact update` command.

#### Scenario: Eval report is displayed

- **WHEN** `viewMode` is `eval_dashboard`
- **THEN** MessageInput SHALL not be rendered
- **AND** a read-only indicator SHALL explain that the report cannot be modified
- **AND** the report HTML SHALL remain unchanged until another completed Eval run is selected

#### Scenario: Return to Chat

- **WHEN** the user selects Chat from the Eval view
- **THEN** WebUI SHALL render the existing ChatView and MessageInput
- **AND** SHALL preserve the Eval artifact for later reopening

### Requirement: Eval progress and failure states

The Eval view SHALL present starting, long-running and failed states outside the report iframe using WebUI design tokens. A failed run SHALL NOT replace the latest successful report. Running state SHALL show elapsed wall time, target/run identity, trajectory actor/Step/evidence summary, seven CHIEF stage states, active worker Application/short ID and validation attempt.

#### Scenario: Target is being prepared

- **WHEN** WebUI has received `starting` but no run identity is available
- **THEN** the Eval view SHALL display that the target is being resolved and frozen
- **AND** SHALL not invent a run ID or stage completion

#### Scenario: CHIEF stage progresses

- **WHEN** WebUI receives a running event for a CHIEF stage
- **THEN** the Eval view SHALL update the matching stage, Application and optional worker Agent short ID
- **AND** SHALL update elapsed time and retry count without parsing text log messages
- **AND** preserve the run and target identity

#### Scenario: CHIEF execution takes several minutes

- **WHEN** no terminal event has arrived for the active Eval run
- **THEN** the Eval view SHALL remain in running state
- **AND** its elapsed timer SHALL continue to advance
- **AND** completed, active and pending stages SHALL remain distinguishable
- **AND** the previous successful report SHALL not be presented as the active run

#### Scenario: Eval fails before Dashboard generation

- **WHEN** WebUI receives a failed event with stage and error
- **THEN** it SHALL display the failed stage and escaped error summary
- **AND** SHALL NOT render partial output as a completed report
- **AND** if the same target Session has a previously completed report, automatically render the newest such report while retaining the failed status
- **AND** identify both the failed run and the historical report run
- **AND** the historical report iframe SHALL fill the remaining area below the failure notice
- **AND** SHALL NOT render a successful report belonging to another target Session
- **AND** if no same-target completed report exists, display the failure surface without a Dashboard

### Requirement: Eval view follows the approved prototype

The WebUI Eval presentation SHALL follow `docs/prototypes/archive/2026-08-05-show-eval-dashboard-in-webui/show-eval-dashboard-in-webui-embedded-report.html`, including the always-visible shell-level three-mode navigation, Eval-only main area, target/run metadata toolbar, starting/running/completed/failed states, read-only footer and responsive behavior. Starting, Running and Failed SHALL fill the available Chat main-area width and height using the same outer gutter as ChatView rather than a fixed-width centered card. It SHALL NOT render explanatory Chat or Session Dashboard placeholder pages inside the Eval main area.

#### Scenario: Eval mode owns the main area

- **WHEN** `viewMode` is `eval_dashboard`
- **THEN** every main-area state SHALL describe the active or selected Eval run
- **AND** text such as "Chat remains unchanged" or a mock Session Dashboard SHALL not appear in the Eval content area

#### Scenario: Running state fills the Chat workspace

- **WHEN** WebUI displays a Starting, Running or Failed Eval lifecycle
- **THEN** the lifecycle surface SHALL occupy the full available main-area width and height inside the standard 16px Chat gutter
- **AND** the progress content SHALL NOT be constrained by a desktop fixed width such as 610px
- **AND** stage rows and metadata SHALL expand responsively without horizontal page overflow

#### Scenario: Narrow viewport

- **WHEN** the WebUI viewport is narrower than 768 pixels
- **THEN** the Eval view SHALL remain usable without horizontal page overflow
- **AND** non-essential toolbar labels and the Session sidebar MAY collapse
- **AND** Chat, Dashboard and Eval mode controls SHALL remain available

#### Scenario: WebUI theme changes

- **WHEN** the user switches between light and dark WebUI themes
- **THEN** the Eval toolbar, lifecycle panels and read-only footer SHALL use the active WebUI tokens
- **AND** the self-contained CHIEF report SHALL remain legible within its iframe
