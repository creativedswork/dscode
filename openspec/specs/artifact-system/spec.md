## ADDED Requirements

### Requirement: Artifact server events
The WebSocket protocol SHALL define three server-to-client event types for artifact streaming: `artifact_start`, `artifact_delta`, and `artifact_end`.

#### Scenario: Artifact generation starts
- **WHEN** the server begins generating an artifact
- **THEN** it sends `{ "type": "artifact_start" }` to the client

#### Scenario: Artifact content streams
- **WHEN** the LLM produces artifact content during streaming
- **THEN** the server sends `{ "type": "artifact_delta", "delta": "<div class="...">" }` events incrementally

#### Scenario: Artifact generation completes
- **WHEN** the LLM finishes generating the artifact
- **THEN** the server sends `{ "type": "artifact_end" }` to the client

### Requirement: Artifact client command
The ClientCommand type SHALL include an `artifact` command with action `"generate"` (with a `context` field for prompt selection) or `"update"` (with an `instruction` field for modification).

#### Scenario: Client requests artifact generation
- **WHEN** the client sends `{ "type": "artifact", "action": "generate", "context": "session_dashboard" }`
- **THEN** the server constructs an artifact prompt using the context, launches an independent LLM call, and streams `artifact_start` / `artifact_delta` / `artifact_end` events

#### Scenario: Client requests artifact update
- **WHEN** the client sends `{ "type": "artifact", "action": "update", "instruction": "highlight bash calls" }`
- **THEN** the server takes the existing artifact HTML plus the instruction, launches an independent LLM call, and streams updated `artifact_delta` events from the start

### Requirement: Independent LLM call for artifacts
The artifact generation LLM call SHALL be independent from the main agent conversation loop. It SHALL NOT modify `conversation messages`, consume the agent's context window, or affect the agent's `processing` state.

#### Scenario: Artifact generation does not block agent
- **WHEN** the server is processing an artifact generation request
- **THEN** the main agent's `processing` state is unaffected
- **AND** the user can continue interacting with the main agent in parallel

### Requirement: html_output_skill file loading
The server SHALL, when building the artifact generation prompt, check for the existence of `.dscode/html_output_skill` in the project root. If the file exists, its contents SHALL be injected into the system prompt as style constraints for the LLM.

#### Scenario: Skill file exists
- **WHEN** `.dscode/html_output_skill` exists in the project root and an artifact `generate` command is received
- **THEN** the file contents are included in the LLM system prompt under an "Artifact Style Rules" section

#### Scenario: Skill file absent
- **WHEN** `.dscode/html_output_skill` does not exist in the project root
- **THEN** the artifact generation proceeds without style constraints; the LLM chooses styles autonomously

### Requirement: Frontend artifact rendering in iframe sandbox
The frontend SHALL render artifact HTML content inside an `<iframe>` element using the `srcdoc` attribute with `sandbox="allow-same-origin"`. The `allow-scripts` permission SHALL NOT be granted.

#### Scenario: Artifact delta updates iframe
- **WHEN** the client receives an `artifact_delta` event
- **THEN** the delta content is appended to an accumulating HTML string and the iframe's `srcdoc` is updated

#### Scenario: Artifact start clears iframe
- **WHEN** the client receives an `artifact_start` event
- **THEN** the accumulated HTML string is reset to empty and the iframe displays a loading state

#### Scenario: No script execution
- **WHEN** artifact HTML is rendered in the iframe
- **THEN** JavaScript within the artifact HTML does NOT execute; the `sandbox` attribute does not include `allow-scripts`

### Requirement: Artifact loading state
The ArtifactContainer SHALL display a loading indicator while `artifact_delta` events are streaming (between `artifact_start` and `artifact_end`).

#### Scenario: Loading during generation
- **WHEN** `artifact_start` has been received but `artifact_end` has not yet arrived
- **THEN** the ArtifactContainer displays a spinner or skeleton placeholder visible to the user

### Requirement: Parallel artifact generation during transition
The frontend SHALL allow artifact generation to be initiated during the Chat → Dashboard transition animation, before the view mode actually switches. The server-side artifact protocol (events and commands) is unchanged.

#### Scenario: Artifact generation fires at transition start
- **WHEN** `transitionPhase` is set to `"animating"`
- **THEN** the frontend SHALL send `{ "type": "artifact", "action": "generate", "context": "session_dashboard" }` immediately
- **AND** `artifactLoading` SHALL be set to `true`
- **AND** the artifact streaming proceeds independently of the animation

#### Scenario: Artifact ready during formed phase
- **WHEN** `artifact_end` is received while TransitionCanvas is in formed phase
- **THEN** `artifactLoadingRef.current` SHALL be set to `false`
- **AND** TransitionCanvas SHALL detect readiness on its next frame poll
- **AND** if `formedTime > 600ms`, `onComplete()` SHALL be called
