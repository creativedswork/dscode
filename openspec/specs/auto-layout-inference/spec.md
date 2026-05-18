## ADDED Requirements

### Requirement: dscode SHALL auto-generate MDX layout from structuredContent when no UI resource exists

When a tool execution completes and the tool has `_meta.ui.resourceUri` set but the resource fetch returns no HTML (or no resource is registered), dscode SHALL inspect the `structuredContent` shape and generate a default MDX layout string. The generated layout SHALL be stored in the AppInstance and served as data mode to the sandbox.

#### Scenario: Array of objects with numeric fields

- **WHEN** `structuredContent` contains a key whose value is an array of objects with numeric fields (e.g., `projections: [{month:1, mrr:50000, netProfit:10000}, ...]`)
- **THEN** the auto-layout SHALL generate `<Chart data={projections} x="month" y=["mrr","netProfit"]/>` plus `<Table rows={projections}/>`

#### Scenario: Object with summary numbers

- **WHEN** `structuredContent` contains a key whose value is a flat object with numeric values (e.g., `summary: {endingMRR:63400, arr:760900, ...}`)
- **THEN** the auto-layout SHALL generate `<Metrics items={summary}/>`

#### Scenario: Multiple data shapes combined

- **WHEN** `structuredContent` contains both array data and summary data
- **THEN** the auto-layout SHALL generate a compound layout: `<Metrics ...>\n<Chart ...>\n<Table ...>`

#### Scenario: Server provides explicit MDX override

- **WHEN** `structuredContent._ui.mdx` is a non-empty string
- **THEN** the auto-layout SHALL use the Server-provided MDX string instead of generating one

#### Scenario: No structuredContent

- **WHEN** the tool result has no `structuredContent` field
- **THEN** no MCP App SHALL be registered (text-only result, current behavior unchanged)

### Requirement: Generated layout SHALL include a title

The auto-generated layout SHALL include a `<Card>` component wrapping the content, with the tool's description or name as the title.

#### Scenario: Title from tool description

- **WHEN** the tool has a `description` field
- **THEN** the generated layout SHALL use it as the title text
