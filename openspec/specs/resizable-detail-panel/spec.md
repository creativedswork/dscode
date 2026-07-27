# resizable-detail-panel Specification

## Purpose
TBD - created by archiving change web-ui-spatial-refinement. Update Purpose after archive.
## Requirements
### Requirement: Detail panel is resizable

The detail panel appearing when a sidebar nav item is clicked SHALL be horizontally resizable via drag. The detail panel SHALL use the existing `useResizablePanel` hook with `storageKey: "dscode-detail-panel-width"`, `defaultWidth: 320`, `minWidth: 240`, `maxWidth: 480`.

#### Scenario: Detail panel initializes at default width
- **WHEN** the detail panel first renders and no saved width exists in localStorage
- **THEN** the detail panel SHALL render at 320px width

#### Scenario: Detail panel restores saved width
- **WHEN** the detail panel renders and a saved width exists in localStorage under `dscode-detail-panel-width`
- **THEN** the detail panel SHALL render at the saved width

#### Scenario: User drags to resize detail panel
- **WHEN** the user presses and drags the detail panel's right-edge resize handle
- **THEN** the panel width SHALL update in real-time following pointer movement
- **AND** the width SHALL be clamped between 240px and 480px
- **AND** the cursor SHALL be `col-resize` during the drag

#### Scenario: Detail panel width persisted
- **WHEN** the user releases the resize handle after changing the panel width
- **THEN** the new width SHALL be saved to localStorage under `dscode-detail-panel-width`

### Requirement: Resize handle on detail panel right edge

A resize handle SHALL be rendered on the right edge of the detail panel, visually matching the existing sidebar resize handle pattern. The handle SHALL be 6px wide, positioned absolutely on the right edge, with cursor `col-resize`, and SHALL highlight with accent color on hover.

#### Scenario: Resize handle appearance
- **WHEN** the detail panel renders
- **THEN** a 6px-wide vertical handle SHALL appear on the panel's right edge
- **AND** the handle SHALL have `cursor: col-resize`
- **AND** the handle SHALL show accent background at 30% opacity on hover

