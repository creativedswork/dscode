## ADDED Requirements

### Requirement: Fuzzy pattern auto-derived for MCP tools
When a permission prompt is shown for an MCP tool (name matching `mcp__<server>__<rest>`), the system SHALL auto-derive a fuzzy glob pattern `mcp__<server>__*` and present it alongside the exact tool name as a save option.

#### Scenario: Fuzzy pattern derived for MCP tool
- **WHEN** permission is prompted for `mcp__playcanvas__create_scene`
- **THEN** the fuzzy save option SHALL display `mcp__playcanvas__*`

#### Scenario: No fuzzy pattern for non-MCP tool
- **WHEN** permission is prompted for `bash`
- **THEN** no fuzzy save option SHALL be presented (only exact)

#### Scenario: No fuzzy pattern for non-namespaced tool
- **WHEN** permission is prompted for `read_file`
- **THEN** no fuzzy save option SHALL be presented (only exact)

### Requirement: TUI presents exact/fuzzy sub-options on save
When the user presses `s` ("Always Allow (save)") in the TUI permission prompt and a fuzzy pattern can be derived, the TUI SHALL display sub-options: `[1] exact: <toolName>` and `[2] fuzzy: <fuzzyPattern>`. The TUI SHALL accept `1` to save the exact name, `2` to save the fuzzy pattern, and `Escape` to return to the main prompt.

#### Scenario: TUI shows fuzzy sub-option
- **WHEN** user presses `s` for `mcp__playcanvas__create_scene`
- **THEN** the TUI SHALL display:
  ```
  [1] exact: mcp__playcanvas__create_scene
  [2] fuzzy: mcp__playcanvas__*
  ```

#### Scenario: TUI saves exact on key 1
- **WHEN** user presses `1` in the sub-option menu
- **THEN** `persistRule` SHALL contain `{tool: "mcp__playcanvas__create_scene", decision: "allow"}`

#### Scenario: TUI saves fuzzy on key 2
- **WHEN** user presses `2` in the sub-option menu
- **THEN** `persistRule` SHALL contain `{tool: "mcp__playcanvas__*", decision: "allow"}`

#### Scenario: TUI Escape returns to main prompt
- **WHEN** the sub-option menu is shown and user presses Escape
- **THEN** the main permission prompt options SHALL be re-displayed

#### Scenario: TUI skips sub-options when no fuzzy pattern
- **WHEN** user presses `s` for `bash` (no fuzzy derivable)
- **THEN** the exact name SHALL be saved immediately (no sub-option menu)

### Requirement: Web presents exact/fuzzy sub-buttons on save
When the user clicks "Save as Rule" in the Web permission dialog and a fuzzy pattern can be derived, the dialog SHALL display two buttons: "Exact: `<toolName>`" and "Fuzzy: `<fuzzyPattern>`". Clicking either button SHALL immediately send the persist command with the corresponding pattern.

#### Scenario: Web shows fuzzy sub-button
- **WHEN** user clicks "Save as Rule" for `mcp__playcanvas__create_scene`
- **THEN** two buttons SHALL appear:
  - "Exact: mcp__playcanvas__create_scene"
  - "Fuzzy: mcp__playcanvas__*"

#### Scenario: Web sends exact persist
- **WHEN** user clicks "Exact: mcp__playcanvas__create_scene"
- **THEN** a `ClientCommand` of type `permission` with `decision: "always_allow_save"` SHALL be sent (no `toolNamePattern`)

#### Scenario: Web sends fuzzy persist
- **WHEN** user clicks "Fuzzy: mcp__playcanvas__*"
- **THEN** a `ClientCommand` of type `permission` with `decision: "always_allow_save"` and `toolNamePattern: "mcp__playcanvas__*"` SHALL be sent

#### Scenario: Web skips sub-buttons when no fuzzy pattern
- **WHEN** user clicks "Save as Rule" for `bash` (no fuzzy derivable)
- **THEN** the exact name SHALL be saved immediately (no sub-buttons)

### Requirement: Fuzzy pattern derivation function
The system SHALL provide a `deriveFuzzyPattern(toolName: string): string | null` function. For tool names matching `mcp__<server>__<rest>`, it SHALL return `mcp__<server>__*`. For all other tool names, it SHALL return `null`.

#### Scenario: Derive from MCP tool
- **WHEN** `deriveFuzzyPattern("mcp__lsp__textDocument_hover")` is called
- **THEN** it SHALL return `"mcp__lsp__*"`

#### Scenario: Null for non-MCP tool
- **WHEN** `deriveFuzzyPattern("bash")` is called
- **THEN** it SHALL return `null`

#### Scenario: Null for bare mcp prefix
- **WHEN** `deriveFuzzyPattern("mcp__")` is called
- **THEN** it SHALL return `null`
