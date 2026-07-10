## ADDED Requirements

### Requirement: Chat command accepts optional fileRefs field
The `ClientCommand` for `chat` type SHALL accept an optional `fileRefs: string[]` field carrying absolute file paths attached to the message, separate from the `text` field.

#### Scenario: Chat with fileRefs
- **WHEN** client sends `{"type":"chat","text":"review the code","fileRefs":["/Users/x/project/src/app.ts","/Users/x/Downloads/report.pdf"]}`
- **THEN** server SHALL accept the command
- **AND** server SHALL resolve the fileRefs using `resolveFileRefs()`
- **AND** the resolved content SHALL be included in the message sent to the agent

#### Scenario: Chat without fileRefs
- **WHEN** client sends `{"type":"chat","text":"hello"}`
- **THEN** server SHALL process the message identically to before this change
- **AND** `fileRefs` SHALL default to an empty array

#### Scenario: Backward compatibility
- **WHEN** an old client sends `{"type":"chat","text":"review @src/app.ts"}` without `fileRefs`
- **THEN** server SHALL still resolve any `@path` references in the text field via `resolveAtFileRefs()` (existing behavior preserved)
