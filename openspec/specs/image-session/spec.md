## ADDED Requirements

### Requirement: ImageRef Type Definition

The system SHALL define an `ImageRef` type for referencing cached images in session messages.

#### Scenario: ImageRef structure
- **WHEN** a session message contains an image reference
- **THEN** it SHALL use `{ type: "image_ref", hash: string, mimeType: string }`
- **AND** `hash` SHALL be the cache filename (e.g. "a1b2c3d4e5f6a7b8.jpg")
- **AND** `mimeType` SHALL be the MIME type (e.g. "image/jpeg")

### Requirement: Vision Message Log

The system SHALL record each vision model invocation in a `visionMessages` array within the session.

#### Scenario: Vision log structure
- **WHEN** a vision model is called to describe images
- **THEN** the system SHALL create a `VisionMessage` entry with:
  - `turnIndex`: the index of the user turn this vision call belongs to
  - `images`: array of `ImageRef` inputs
  - `prompt`: the text prompt sent to the vision model
  - `description`: the full text response from the vision model
  - `modelProvider`: the vision model provider name
  - `modelId`: the vision model ID
  - `timestamp`: Unix timestamp of the call
  - `latencyMs?`: optional, call duration in milliseconds (reserved for future)
  - `tokensUsed?`: optional, token count (reserved for future)

#### Scenario: Vision log association
- **WHEN** a vision log entry is created
- **THEN** the system SHALL ensure `turnIndex` correctly corresponds to the user message turn in the main session

### Requirement: Image Recovery on Session Load

The system SHALL attempt to recover images when loading a session by reading from the image cache.

#### Scenario: Cache hit on load
- **WHEN** a session message has `ImageRef` entries
- **AND** the corresponding cache files exist
- **THEN** the system SHALL read the image data from cache
- **AND** reconstruct the message with inline base64 images for the agent/frontend

#### Scenario: Cache miss on load
- **WHEN** a session message has `ImageRef` entries
- **AND** the corresponding cache files do NOT exist
- **THEN** the system SHALL NOT crash or error
- **AND** SHALL show a placeholder indicator for missing images
