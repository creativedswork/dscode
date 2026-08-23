## ADDED Requirements

### Requirement: Dashboard hosts an interactive Trace block

The Session Dashboard SHALL render an interactive Trace trajectory tree as a first-class content widget embedded within the LLM-generated report's content flow (like its metric cards and charts), NOT as a separate partitioned panel. The Trace widget SHALL be placed at a reserved slot in the report HTML and injected by the client as a self-contained interactive block. The Trace widget SHALL be expandable to fullscreen (covering the report viewport) and restorable. Rendering or expanding the Trace widget SHALL NOT trigger report regeneration and SHALL NOT alter the report's other content or Main Agent context.

#### Scenario: Dashboard shows Trace block

- **WHEN** the user opens the Session Dashboard for a non-empty Session
- **THEN** the Dashboard SHALL render the Trace widget within the report content flow
- **AND** the Trace block SHALL present the current Session's trajectory tree

#### Scenario: Trace block fullscreen and restore

- **WHEN** the user activates the Trace block's fullscreen control
- **THEN** the Trace widget SHALL expand to cover the report viewport
- **AND** activating the control again SHALL restore the embedded layout

#### Scenario: Trace block does not regenerate the report

- **WHEN** the Trace block is rendered or expanded
- **THEN** the frontend SHALL NOT send an `artifact generate` or `artifact update` command
- **AND** the cached LLM report SHALL remain unchanged

#### Scenario: Trace block without SubAgent records

- **WHEN** the Session has Main-Agent messages but no `agentMessages`
- **THEN** the Trace block SHALL still render the Main-Agent-only tree
- **AND** SHALL not display an error or omit the block
