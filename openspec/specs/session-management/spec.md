## ADDED Requirements

### Requirement: Session Version Upgrade to V2

The `SerializedSession` SHALL support version 2 with image references.

#### Scenario: V2 session save
- **WHEN** a session contains messages with images
- **THEN** the saved session file SHALL have `version: 2`
- **AND** messages SHALL use `ImageRef` instead of inline base64 for image content
- **AND` metadata SHALL include `hasImages: boolean` and `imageCount: number`

#### Scenario: V2 session load
- **WHEN** a session file with `version: 2` is loaded
- **THEN** the system SHALL parse its messages including `ImageRef` and `visionMessages`
- **AND** attempt to recover image data from cache

### Requirement: V1 Backward Compatibility

The session store SHALL load version 1 session files without error.

#### Scenario: Load V1 session
- **WHEN** a session file has `version: 1`
- **THEN** the system SHALL load it successfully
- **AND** set `hasImages: false` on the metadata
- **AND** not attempt to parse `visionMessages` or `ImageRef` fields
