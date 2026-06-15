# eval-dashboard Delta Specification

## ADDED Requirements

### Requirement: Recovery Timeline Section

When `EvalResult.recoveryArcs` is present and non-empty, the dashboard SHALL render a "Recovery Timeline" (恢复时间线) section between the Causal Graph and Rule Reasoning Chain sections.

Each `RecoveryArc` SHALL be rendered as a horizontal timeline row showing the error→detection→correction progression with color-coded segments:
- **Red** segment: Error event (errorStep, errorAgent, errorSummary)
- **Yellow** segment: Detection event (detectionStep, detectionType)
- **Green** segment: Correction event (correctionStep, correctionAgent, correctionSummary, effective status)

Each timeline row SHALL display:
- The recovery arc sequence visually (red → yellow → green)
- Error summary text
- Detection type label
- Correction summary text
- Steps-to-recover count
- Misdiagnosis count (if > 0)
- An effectiveness indicator (✅ for effective, ⚠️ for ineffective)
- **`rootCauseHypothesis`** displayed below the timeline as a 💡 insight callout

#### Scenario: Dashboard with recovery arcs

- **WHEN** a session analysis produces 2 recovery arcs
- **THEN** the dashboard SHALL display a "Recovery Timeline" section
- **AND** two timeline rows SHALL be rendered
- **AND** each row SHALL use red/yellow/green color coding
- **AND** each row SHALL display the `rootCauseHypothesis` below the timeline

#### Scenario: Dashboard without recovery arcs

- **WHEN** `EvalResult.recoveryArcs` is undefined or empty
- **THEN** the dashboard SHALL NOT render the Recovery Timeline section
- **AND** all other sections SHALL render normally

#### Scenario: Recovery arc with misdiagnosis

- **WHEN** a recovery arc has `misdiagnosisCount: 2`
- **THEN** the timeline row SHALL display "2 次误判" in a warning style
- **AND** the steps-to-recover count SHALL reflect the total steps from error to final correction

#### Scenario: Ineffective recovery arc
- **WHEN** a recovery arc has `effective: false`
- **THEN** the correction event SHALL show ⚠️ instead of ✅
- **AND** the green segment SHALL use a muted/warning color to indicate incomplete recovery

#### Scenario: Recovery arc with rootCauseHypothesis

- **WHEN** a recovery arc has `rootCauseHypothesis: "Agent didn't read component structure before writing"`
- **THEN** the timeline row SHALL display "💡 根因假说: Agent didn't read component structure before writing" below the timeline
- **AND** the hypothesis SHALL be styled distinctively (e.g., italic, accent color)
- **AND** the green segment SHALL use a muted/warning color to indicate incomplete recovery

### Requirement: Recovery Arc Styling

The recovery timeline SHALL use inline styles compatible with the dark theme. Color scheme:
- Error (red): `#f85149` background, white text
- Detection (yellow): `#d2991d` background, dark text
- Correction effective (green): `#3fb950` background, dark text
- Correction ineffective (muted): `rgba(210,153,29,0.3)` background
- Container: `#161b22` background, `#30363d` border, 6px border-radius

The section header SHALL use the existing `h2` style with `#f0f6fc` color.

#### Scenario: Recovery timeline matches dashboard theme

- **WHEN** the recovery timeline is rendered
- **THEN** all colors SHALL come from the existing COLORS constant
- **AND** no external CSS files SHALL be referenced
- **AND** the section SHALL be responsive within the dashboard container
