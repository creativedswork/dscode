## ADDED Requirements

### Requirement: Dashboard hosts an interactive Trace tree

The Session Dashboard SHALL render an interactive trajectory tree as a first-class content widget embedded within the LLM-generated report's content flow (like its metric cards and charts), NOT as a separate partitioned panel. The Trace widget SHALL be placed at a reserved slot in the report HTML and injected by the client as a self-contained interactive block. The Trace widget SHALL be read-only: rendering it SHALL NOT trigger report regeneration and SHALL NOT alter the report's other content or Main Agent context. The widget SHALL NOT provide a fullscreen mode.

#### Scenario: Dashboard shows Trace tree

- **WHEN** the user opens the Session Dashboard for a non-empty Session
- **THEN** the Dashboard SHALL render the Trace trajectory-tree widget within the report content flow
- **AND** the Trace block SHALL present the current Session's trajectory tree

#### Scenario: Trace tree does not regenerate the report

- **WHEN** the Trace widget is rendered
- **THEN** the frontend SHALL NOT send an `artifact generate` or `artifact update` command
- **AND** the cached LLM report SHALL remain unchanged

#### Scenario: Trace tree without SubAgent records

- **WHEN** the Session has Main-Agent messages but no `agentMessages`
- **THEN** the Trace widget SHALL still render the Main-Agent-only tree
- **AND** SHALL not display an error or omit the block

#### Scenario: Trace tree has no fullscreen mode

- **WHEN** the Trace widget renders
- **THEN** it SHALL NOT expose a fullscreen toggle
- **AND** it SHALL remain embedded at its reserved slot in the report content flow
