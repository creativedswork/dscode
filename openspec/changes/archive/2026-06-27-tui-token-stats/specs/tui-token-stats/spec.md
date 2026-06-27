## ADDED Requirements

### Requirement: TUI displays token usage after each turn

The TUI SHALL display token consumption, API cost, and context window utilization percentage after each assistant turn completes. The information SHALL appear as a dimmed single line appended after the assistant message, merged with the existing `⏱ total wait` line when both are present.

#### Scenario: Full display with wait time, token usage, and cost

- **WHEN** an assistant turn completes with total wait time >= 1 second AND usage data containing input tokens, output tokens, and cost.total > 0, AND context window utilization is available
- **THEN** the TUI SHALL render a dim line in the format `⏱ 3.2s · 📊 12.4k↓ 3.2k↑ · ▓▓ 77% · 💰 $0.0032`

#### Scenario: Token and cost without wait time

- **WHEN** an assistant turn completes with total wait time < 1 second AND usage data is present
- **THEN** the TUI SHALL render a dim line in the format `📊 12.4k↓ 3.2k↑ · ▓▓ 77% · 💰 $0.0032`
- **AND** the `⏱` segment SHALL be omitted

#### Scenario: Token usage without cost

- **WHEN** an assistant turn completes and cost.total is 0 or undefined
- **THEN** the TUI SHALL render a dim line in the format `📊 12.4k↓ 3.2k↑ · ▓▓ 77%`
- **AND** the `💰` segment SHALL be omitted

#### Scenario: No usage data available

- **WHEN** an assistant turn completes but `turn:end` event carries no usage payload
- **THEN** the TUI SHALL render only the existing `⏱ total wait` line (if applicable)
- **AND** no token/cost information SHALL be displayed

### Requirement: Token formatting

The system SHALL format token counts using human-readable abbreviations.

#### Scenario: Format tokens >= 1 million

- **WHEN** a token count is 1,500,000
- **THEN** it SHALL be formatted as `1.5M`

#### Scenario: Format tokens >= 1000

- **WHEN** a token count is 12,400
- **THEN** it SHALL be formatted as `12.4k`

#### Scenario: Format tokens < 1000

- **WHEN** a token count is 542
- **THEN** it SHALL be formatted as `542`

### Requirement: Cost formatting

The system SHALL format API cost using dollar or cent notation based on magnitude.

#### Scenario: Format cost >= $0.01

- **WHEN** cost.total is 0.0324
- **THEN** it SHALL be formatted as `$0.0324`

#### Scenario: Format cost < $0.01

- **WHEN** cost.total is 0.0012
- **THEN** it SHALL be formatted as `¢0.12`

#### Scenario: Format zero cost

- **WHEN** cost.total is 0
- **THEN** the cost segment SHALL be omitted entirely

### Requirement: Context window utilization display

The system SHALL display the percentage of the model's context window currently occupied by the conversation. The percentage SHALL be computed as `Math.round(estimatedTokens / contextWindow * 100)` and displayed with the `▓▓` prefix. Color SHALL vary by threshold.

#### Scenario: Normal utilization (≤80%)

- **WHEN** context utilization is ≤80%
- **THEN** the `▓▓ XX%` segment SHALL be rendered in dim color

#### Scenario: High utilization (>80%)

- **WHEN** context utilization is >80% and ≤95%
- **THEN** the `▓▓ XX%` segment SHALL be rendered in yellow

#### Scenario: Critical utilization (>95%)

- **WHEN** context utilization is >95%
- **THEN** the `▓▓ XX%` segment SHALL be rendered in red

#### Scenario: Context window unavailable

- **WHEN** the `ContextManager` cannot provide a valid context window size
- **THEN** the `▓▓` segment SHALL be omitted
