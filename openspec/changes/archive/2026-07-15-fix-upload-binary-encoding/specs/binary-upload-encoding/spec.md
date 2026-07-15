## ADDED Requirements

### Requirement: Non-image files uploaded as base64-encoded bytes
Non-image files dropped onto the Web UI SHALL be read as raw bytes using `FileReader.readAsArrayBuffer()`, encoded as a base64 string, and transmitted to the server. The server SHALL decode the base64 string back to raw bytes and write them to disk without any text encoding conversion.

#### Scenario: Binary file uploaded byte-accurately
- **WHEN** the user drops a PDF file (or any non-image binary file) within size limits
- **THEN** the file content SHALL be read via `readAsArrayBuffer()`
- **AND** the ArrayBuffer SHALL be converted to a base64 string
- **AND** the server SHALL decode the base64 string via `Buffer.from(content, "base64")`
- **AND** the written file on disk SHALL be byte-identical to the original dropped file

#### Scenario: Text file uploaded byte-accurately
- **WHEN** the user drops a text file (`.txt`, `.md`, `.csv`, etc.) within size limits
- **THEN** the file SHALL be read via `readAsArrayBuffer()` (not `readAsText()`)
- **AND** encoded as base64 same as binary files
- **AND** the written file on disk SHALL be byte-identical to the original dropped file

#### Scenario: Image file path unchanged
- **WHEN** the user drops an image file
- **THEN** it SHALL continue to use the existing `readAsDataURL()` + compress pipeline
- **AND** the base64 encoding path SHALL NOT apply to image files
