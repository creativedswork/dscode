## ADDED Requirements

### Requirement: Server SHALL be able to provide MDX layout in structuredContent

A MCP Server tool MAY include `_ui.mdx` in its `structuredContent` return value. When present, dscode SHALL use this MDX string as the layout instead of auto-inference. The MDX string MAY reference any top-level key in `structuredContent` as a data binding.

#### Scenario: Server provides custom MDX layout

- **WHEN** a tool returns `{ structuredContent: { _ui: { mdx: "<Chart type=\"bar\" data={monthly} x=\"month\" y=\"revenue\"/>" }, monthly: [...] } }`
- **THEN** dscode SHALL use the Server-provided MDX string for layout
- **AND** data bindings SHALL resolve against sibling keys in `structuredContent`

#### Scenario: Server does not provide MDX

- **WHEN** a tool returns `structuredContent` without `_ui.mdx`
- **THEN** dscode SHALL fall back to auto-layout inference

#### Scenario: Server provides both HTML resource and MDX

- **WHEN** a tool has `_meta.ui.resourceUri` AND returns `_ui.mdx` in `structuredContent`
- **THEN** dscode SHALL prefer the HTML resource (backward compatibility)
- **AND** the MDX override SHALL be ignored
