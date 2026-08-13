## RENAMED Requirements

- FROM: `Harness is a Headless composition root`
- TO: `Harness is a Headless Application coordinator`

## MODIFIED Requirements

### Requirement: Harness is a Headless Application coordinator

`Harness` SHALL be a Headless Application lifecycle and use-case coordinator
owned by `src/application/harness.ts`. `src/bootstrap/create-standard-agent-host.ts`
SHALL be the standard concrete composition root that constructs runtime owners
and provides them to Harness. Harness SHALL expose only `HarnessAPI` to UI and
SDK adapters. It SHALL NOT select a UI backend, install process signal handlers,
change the process working directory, or expose internal Manager objects through
`HarnessAPI`.

#### Scenario: CLI selects the presentation adapter

- **WHEN** CLI bootstrap creates an Agent Host
- **THEN** `createStandardAgentHost()` SHALL assemble the concrete runtime owners and Harness
- **AND** CLI bootstrap SHALL choose TUI or Web presentation
- **AND** both adapters SHALL consume `HarnessAPI`

#### Scenario: Headless Host starts without Presentation

- **WHEN** a programmatic caller creates and initializes a standard Agent Host without selecting TUI or Web
- **THEN** Harness SHALL coordinate Application lifecycle without importing a Presentation implementation
