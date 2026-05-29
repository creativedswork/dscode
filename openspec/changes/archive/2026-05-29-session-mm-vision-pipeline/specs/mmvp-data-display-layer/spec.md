## ADDED Requirements

### Requirement: Data Layer Neutrality

`agent.state.messages` SHALL reflect exactly what the model received as input and SHALL NOT be modified for display purposes.

#### Scenario: Vision pipeline message in agent state
- **WHEN** a user sends images that require vision model processing
- **AND** the main model receives enriched text (with `<image_description>`)
- **THEN** `agent.state.messages[i].content` SHALL contain the enriched text
- **AND** `agent.state.messages[i].images` SHALL be undefined (model received no images)

#### Scenario: Native image model message in agent state
- **WHEN** the main model supports images natively
- **AND** images are sent directly
- **THEN** `agent.state.messages[i].content` MAY contain text and inline image blocks
- **AND** this reflects what the model actually received

### Requirement: Vision Message as Display Bridge

`visionMessages` SHALL store image references linked by `messageIndex` to enable display layer reconstruction.

#### Scenario: Vision message linkage
- **WHEN** a vision model call completes
- **THEN** a `VisionMessage` SHALL be created with `messageIndex` pointing to the user message in `agent.state.messages`
- **AND** `VisionMessage.images` SHALL contain `ImageRef[]` for cache-based image restoration

### Requirement: Display Layer Image Restoration

The display layer SHALL reconstruct user-visible messages by stripping machine-generated descriptions and restoring images from vision messages.

#### Scenario: Web UI conversation history reconstruction
- **WHEN** `buildConversationHistory()` renders a message with a matching `visionMessages[].messageIndex`
- **THEN** the content SHALL have `<image_description>` blocks stripped
- **AND** images SHALL be restored from `ImageCache.get()` and returned as base64 `ImageAttachment[]`

#### Scenario: Message without vision association
- **WHEN** a message has no matching `visionMessages` entry
- **THEN** content SHALL be returned as-is
- **AND** images from inline blocks (native image models) SHALL be extracted normally
