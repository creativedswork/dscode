## ADDED Requirements

### Requirement: HarnessEventBus publishes presentation-neutral episode state
HarnessEventBus SHALL publish typed episode lifecycle events containing domain state
and stable identifiers without UI labels, component names, rendered markup, or
terminal formatting.

#### Scenario: Episode state changes
- **WHEN** an episode starts, enters reflection, pauses inconclusively, resumes, or completes
- **THEN** the event bus emits a `plan:episode` event with the authoritative snapshot

#### Scenario: Counters change without a lifecycle transition
- **WHEN** accepted progress or bounded monitor counters change
- **THEN** the event bus may emit an updated `plan:episode` snapshot without requiring clients to infer the delta

### Requirement: HarnessEventBus publishes bounded impasse facts
HarnessEventBus SHALL publish a `plan:impasse` event when the Executive Monitor
reaches an impasse threshold. The payload SHALL identify the triggering rule,
reflection availability, unchanged progress summary, and bounded fingerprint or error
facts, and MUST NOT include private model reasoning or unrestricted Tool output.

#### Scenario: First impasse allows reflection
- **WHEN** an initial execution episode reaches an impasse
- **THEN** the emitted event states that reflection is available and identifies the threshold reached

#### Scenario: Later impasse causes pause
- **WHEN** execution reaches an impasse after reflection has been used
- **THEN** the emitted event states that automatic execution will pause inconclusively

#### Scenario: UI adapter consumes an impasse
- **WHEN** Web or TUI receives a `plan:impasse` event
- **THEN** it can render the reason without parsing model text, Tool logs, or warning strings
