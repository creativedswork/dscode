## ADDED Requirements

### Requirement: Vision Call Logging

When vision model is used to describe images, the system SHALL log the call details into the session.

#### Scenario: Vision model invoked
- **WHEN** `describeImagesViaVisionModel()` is called successfully
- **THEN** the system SHALL create a `VisionMessage` with: input `ImageRef[]`, `description` text, `modelProvider`, `modelId`, `timestamp`, `turnIndex`
- **AND** append it to a `visionMessages` array in the session

#### Scenario: Vision model failure
- **WHEN** `describeImagesViaVisionModel()` fails
- **THEN** the system SHALL NOT create a `VisionMessage` entry (no partial log)
- **AND** proceed to OCR fallback as before

### Requirement: Image Caching Before Vision Call

Before sending images to the vision model, the system SHALL first cache them.

#### Scenario: Cached images sent to vision
- **WHEN** images are sent to the vision model
- **THEN** the system SHALL first pass them through `ImageCache.put()`
- **AND** use the cached (compressed) image data for the vision API call
- **AND** include the resulting `ImageRef[]` in the `VisionMessage` log
