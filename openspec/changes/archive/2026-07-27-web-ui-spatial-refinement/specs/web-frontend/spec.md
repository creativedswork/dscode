## Purpose

Delta specification for the `web-frontend` capability. Detail panels now use resizable width, sidebar icons scale up, and typography adjusts.

## ADDED Requirements

### Requirement: Editorial workshop design language

All frontend components SHALL use the editorial workshop design system. The app shell SHALL use the 38px topbar, 220px sidebar with resizable expandable detail panels (default 320px), and phase-labeled message groups at 11px.

#### Scenario: Typography adoption
- **WHEN** a component renders text
- **THEN** UI chrome, labels, and body text use Geist Sans; code blocks and technical identifiers use Geist Mono
- **AND** section labels (Create, Capabilities) SHALL be 11px weight 600 uppercase with 0.08em letter-spacing
- **AND** panel titles SHALL use serif display font at 15px weight 500
- **AND** phase labels SHALL be 11px weight 600 uppercase
- **AND** the empty state title SHALL use serif display font at 28px weight 300

#### Scenario: Detail panel resizable
- **WHEN** a detail panel (Sessions, MCP, Skills, Settings) renders
- **THEN** it SHALL use the `useResizablePanel` hook with default 320px, min 240px, max 480px
- **AND** a resize handle SHALL appear on the panel's right edge
- **AND** the width SHALL be persisted to localStorage under `dscode-detail-panel-width`


## MODIFIED Requirements

### Requirement: Sidebar restructured

The sidebar SHALL NOT contain a "Views" section. The sidebar SHALL use 15px icons for all navigation items (Sessions, MCP, Skills, Settings).

#### Scenario: Sidebar nav items
- **WHEN** the sidebar renders
- **THEN** all nav item SVG icons SHALL be 15px × 15px
- **AND** the Settings gear icon SHALL be 15px × 15px
