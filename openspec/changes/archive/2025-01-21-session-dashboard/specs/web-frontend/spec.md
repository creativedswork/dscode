## ADDED Requirements

### Requirement: Artifact events handled in App
The App component SHALL handle `artifact_start`, `artifact_delta`, and `artifact_end` server events, accumulating the delta content and passing it to the `ArtifactContainer` component.

#### Scenario: artifact_start clears content
- **WHEN** App receives `{ "type": "artifact_start" }`
- **THEN** the accumulated artifact HTML is set to empty string
- **AND** `artifactLoading` is set to `true`

#### Scenario: artifact_delta appends content
- **WHEN** App receives `{ "type": "artifact_delta", "delta": "<div>" }`
- **THEN** the delta is appended to the accumulated artifact HTML string

#### Scenario: artifact_end finalizes rendering
- **WHEN** App receives `{ "type": "artifact_end" }`
- **THEN** `artifactLoading` is set to `false`

### Requirement: ArtifactContainer component
The frontend SHALL provide an `ArtifactContainer` component that renders an `<iframe>` with `srcdoc` set to the accumulated artifact HTML and `sandbox="allow-same-origin"`.

#### Scenario: ArtifactContainer renders iframe
- **WHEN** `ArtifactContainer` receives a non-empty `html` prop
- **THEN** it renders an `<iframe>` with `srcdoc={html}` and `sandbox="allow-same-origin"`

#### Scenario: ArtifactContainer shows loading
- **WHEN** `ArtifactContainer` receives `loading={true}` and `html` is empty
- **THEN** it displays a spinner or skeleton placeholder

#### Scenario: ArtifactContainer with no content
- **WHEN** `ArtifactContainer` receives `loading={false}` and empty `html`
- **THEN** it displays "Waiting for dashboard generation..." in muted text
