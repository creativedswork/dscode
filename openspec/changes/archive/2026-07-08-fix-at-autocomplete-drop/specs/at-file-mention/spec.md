## MODIFIED Requirements

### Requirement: At-file autocomplete in TUI
The TUI input editor SHALL trigger a fuzzy file path autocomplete when the user types `@` followed by text, using the existing `CombinedAutocompleteProvider` from pi-tui with the project directory as `basePath`.

#### Scenario: At-file trigger
- **WHEN** user types `@` in the TUI editor
- **THEN** the autocomplete dropdown SHALL appear with files from the project directory that match the text after `@`

#### Scenario: Fuzzy matching
- **WHEN** user types `@core` in the TUI editor
- **THEN** the autocomplete SHALL show files like `src/core/main.ts`, `src/core/config.ts` matching the fuzzy query

#### Scenario: Select file with Enter
- **WHEN** user navigates to a file in the autocomplete dropdown and presses Enter
- **THEN** the `@` symbol followed by the relative file path SHALL be inserted into the editor at the cursor position, preserving any whitespace before the `@`

#### Scenario: Select file with Tab
- **WHEN** user navigates to a file in the autocomplete dropdown and presses Tab
- **THEN** the `@` symbol followed by the relative file path SHALL be inserted into the editor at the cursor position, preserving any whitespace before the `@`
