## ADDED Requirements

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
