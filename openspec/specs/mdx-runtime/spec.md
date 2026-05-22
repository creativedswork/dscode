## ADDED Requirements

### Requirement: MDX Runtime SHALL parse and render declarative UI components

The sandbox proxy page SHALL include an MDX Runtime capable of parsing a subset of MDX/JSX syntax and rendering built-in components (Chart, Metrics, Table, Slider, Card, Row). Components SHALL receive data via inline JSON binding expressions.

#### Scenario: Parse Chart component with data binding

- **WHEN** the MDX Runtime receives `<Chart type="line" data={projections} x="month" y={["mrr","netProfit"]}/>`
- **THEN** it SHALL resolve `projections` from the data context and bind `x` and `y` axes to the specified fields
- **AND** render a Canvas-based line chart with the bound data

#### Scenario: Parse Metrics component

- **WHEN** the MDX Runtime receives `<Metrics items={summary} />`
- **THEN** it SHALL render metric cards displaying each key-value pair from the `summary` object

#### Scenario: Parse Table component

- **WHEN** the MDX Runtime receives `<Table rows={templates} />`
- **THEN** it SHALL render an HTML table with columns inferred from the first row's keys

#### Scenario: Parse Slider component with binding

- **WHEN** the MDX Runtime receives `<Slider param="mrr" min={0} max={500000} step={5000} bind={params} format="currency"/>`
- **THEN** it SHALL render a range slider bound to `params.mrr`
- **AND** re-render dependent components (Chart, Metrics) when the slider value changes

#### Scenario: Unknown component

- **WHEN** the MDX Runtime encounters an unrecognized component name
- **THEN** it SHALL render a placeholder div with the component name as text and continue parsing

### Requirement: MDX Runtime SHALL support light/dark theme

Components SHALL use CSS custom properties from the sandbox page (`var(--bg)`, `var(--text)`, `var(--border)`, etc.) and SHALL respond to `prefers-color-scheme` changes.

#### Scenario: Dark mode detection

- **WHEN** the user's OS is set to dark mode
- **THEN** Chart SHALL render grid lines in dark theme colors
- **AND** text labels SHALL use light theme foreground color

### Requirement: MDX Runtime SHALL be delivered as a single JS bundle injected into sandbox.html

The MDX Runtime SHALL be concatenated from source TypeScript files at build time and injected into `sandbox.html` as an inline `<script>` block. It SHALL NOT require any external dependencies at runtime.

#### Scenario: No external requests

- **WHEN** the browser loads the sandbox page in data mode
- **THEN** all MDX Runtime code SHALL execute from the inline script without additional HTTP requests
