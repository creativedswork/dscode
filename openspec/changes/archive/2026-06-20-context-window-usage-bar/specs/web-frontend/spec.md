## MODIFIED Requirements

### Requirement: Conversation view
The WebUI SHALL render a `ContextWindowBar` component in the center zone of the `<header>` element, between the left branding/model area and the right theme/connection area. The header SHALL use a three-zone flexbox layout with the center zone growing to fill available space. On viewports narrower than 768px, the ContextWindowBar SHALL be hidden.

#### Scenario: Header renders three zones
- **WHEN** the WebUI is loaded on a viewport >= 768px wide and context window data is available
- **THEN** the header SHALL show: left zone (sidebar toggle + DSCode branding + model name), center zone (ContextWindowBar), right zone (theme toggle + connection status)

#### Scenario: Center zone is centered
- **WHEN** the header renders with all three zones
- **THEN** the center zone SHALL use `flex: 1` and `justify-content: center` so the ContextWindowBar is horizontally centered regardless of left/right content widths

#### Scenario: ContextWindowBar hidden on mobile
- **WHEN** the viewport width is less than 768px
- **THEN** the ContextWindowBar SHALL not be rendered
- **AND** the existing two-zone (left/right) layout SHALL be preserved
