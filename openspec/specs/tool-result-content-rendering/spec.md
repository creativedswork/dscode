## ADDED Requirements

### Requirement: Content-aware tool result formatting
`formatToolResultForUI` SHALL detect the content type of tool result text and apply appropriate formatting before it reaches the frontend. The function SHALL produce markdown-ready output so that ToolCard can render it through the shared `<Markdown>` component.

#### Scenario: JSON detected and pretty-printed
- **WHEN** a tool result string starts with `{` or `[` and `JSON.parse` succeeds
- **THEN** the function SHALL `JSON.stringify` the parsed value with 2-space indentation
- **AND** SHALL wrap the result in a markdown code fence with `json` language tag (```` ```json ````)

#### Scenario: bash tool result wrapped in code fence
- **WHEN** a `bash` tool completes with output text
- **THEN** the function SHALL wrap the result in a markdown code fence with `sh` language tag (```` ```sh ````)
- **AND** SHALL preserve the existing truncation behavior (600 char default)

#### Scenario: grep tool result with JSON output
- **WHEN** a `grep` tool completes and the result is valid JSON
- **THEN** the function SHALL pretty-print and wrap as ```` ```json ````
- **AND** SHALL preserve the existing truncation behavior

#### Scenario: grep tool result with plain text output
- **WHEN** a `grep` tool completes and the result is not valid JSON
- **THEN** the function SHALL wrap the result in a markdown code fence without language tag (```` ``` ````)
- **AND** SHALL preserve the existing truncation behavior

#### Scenario: glob tool result formatted
- **WHEN** a `glob` tool completes
- **THEN** the function SHALL apply the same JSON detection and code fence wrapping as `grep`

#### Scenario: read_file tool result wrapped in code fence
- **WHEN** a `read_file` tool completes with file content
- **THEN** the function SHALL wrap the result in a markdown code fence without language tag (```` ``` ````)
- **AND** SHALL preserve the existing truncation behavior

#### Scenario: write_file / overwrite_file summary preserved
- **WHEN** a `write_file` or `overwrite_file` tool completes
- **THEN** the function SHALL continue to use the existing `extractWriteSummary` behavior
- **AND** SHALL NOT apply additional code fence wrapping

#### Scenario: Unknown tool with JSON result
- **WHEN** an unrecognized tool produces a result that is valid JSON
- **THEN** the function SHALL pretty-print and wrap as ```` ```json ````
- **AND** SHALL preserve the existing 600-char truncation behavior

#### Scenario: Unknown tool with non-JSON result
- **WHEN** an unrecognized tool produces a result that is not JSON
- **THEN** the function SHALL preserve the existing 600-char truncation behavior without code fence wrapping
