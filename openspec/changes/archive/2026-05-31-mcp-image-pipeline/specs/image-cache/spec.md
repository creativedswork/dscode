## ADDED Requirements

### Requirement: Cache MCP Tool Result Images

The `ImageCache` system SHALL accept and store images originating from MCP tool results in addition to user-uploaded images. The existing content-addressable storage and deduplication mechanisms SHALL apply identically.

#### Scenario: MCP tool image cached
- **WHEN** `ImageCache.put()` is called with an `ImageContent` object originating from an MCP tool result
- **THEN** the image SHALL be resized (if larger than 480px height), compressed to JPEG quality 85, and stored in `~/.dscode/data/images/`
- **AND** an `ImageRef` SHALL be returned with the content hash filename

#### Scenario: Duplicate MCP image deduplicated
- **WHEN** an MCP tool returns the same image content as a previously cached image
- **THEN** the cache SHALL reuse the existing file (no duplicate storage)
- **AND** return the same `ImageRef` with the existing hash
