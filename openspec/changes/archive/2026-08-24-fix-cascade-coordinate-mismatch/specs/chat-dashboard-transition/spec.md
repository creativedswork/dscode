## ADDED Requirements

### Requirement: Coordinate frame alignment between cluster drawing and strike targeting

The cascade animation SHALL ensure the cluster is drawn at the exact on-screen position of the row it strikes. Row positions SHALL be recorded in the chat scroll container's content-space coordinates. Every canvas-space operation (cluster drawing, impact rings, impact particles, per-card impact points) SHALL apply an explicit origin offset compensating any difference between the canvas origin and the scroll container origin.

#### Scenario: Origin offset compensation
- **WHEN** the canvas origin (`canvasRect.top`/`left`) differs from the scroll container origin (`scrollRect.top`/`left`)
- **THEN** the cluster SHALL be drawn at `contentY - scrollTop + (scrollRect.top - canvasRect.top)` on the Y axis
- **AND** at `contentX + (scrollRect.left - canvasRect.left)` on the X axis
- **AND** the impact ring and radial particles SHALL spawn at the same compensated position

#### Scenario: Strike point matches draw point
- **WHEN** the cluster lands on a row
- **THEN** the element that visually receives the impact SHALL be the same row whose destruction effect begins
- **AND** the per-card impact point (`impactX`, `impactY`) SHALL be computed with the same origin offset used for drawing

#### Scenario: Scroll container resolves to the chat scroll container
- **WHEN** the cascade begins
- **THEN** `scrollContainer` SHALL resolve to the actual chat scroll container (via the chat scroll container ref)
- **AND** `getScrollTop()` SHALL return that container's real `scrollTop`
- **AND** `currentScrollRect()` SHALL return that container's bounding rect, not the canvas rect

#### Scenario: Fallback resolution when ref is unavailable
- **WHEN** the chat scroll container ref is null or stale
- **THEN** `scrollContainer` SHALL be derived from the nearest scrollable ancestor of a `[data-collider]` element
- **AND** the animation SHALL NOT fall back to the canvas rect with `scrollTop = 0`

#### Scenario: No persistent coordinate diagnostics
- **WHEN** implementation-time browser diagnostics have confirmed the coordinate frame
- **THEN** temporary `console.*` tracing SHALL be removed from the final implementation
- **AND** an unresolved scroll container SHALL skip cascade rather than use guessed coordinates

### Requirement: Visual-line cascade targets

Each rendered text line SHALL be an independent cascade target, including multiple wrapped lines owned by one Markdown block element. The implementation SHALL derive line bounds from `Range.getClientRects()` and merge inline fragments that share the same visual line.

#### Scenario: Wrapped paragraph produces multiple targets
- **WHEN** one `data-collider="text-block"` paragraph wraps onto multiple rendered lines
- **THEN** each rendered line SHALL produce a separate `CascadeRow`
- **AND** each row's landing and impact point SHALL use that line's tight bounds

#### Scenario: A struck line disappears without collapsing layout
- **WHEN** the cluster strikes one visual line in a multi-line element
- **THEN** the element's `clip-path` SHALL advance through the struck line
- **AND** later lines in the same element SHALL remain visible until struck
- **AND** the element's box dimensions SHALL remain unchanged

#### Scenario: Parent waits for every virtual line
- **WHEN** one descendant DOM element maps to multiple visual rows
- **THEN** its parent card SHALL remain visible until every mapped row is struck

#### Scenario: Artifact streaming preserves collider identity
- **WHEN** Dashboard artifact deltas cause `App` and `Markdown` to re-render during cascade
- **THEN** unchanged Markdown renderer component types SHALL remain stable
- **AND** the live collider DOM nodes SHALL retain the identity captured by `CascadeRow`
- **AND** line clipping SHALL remain visible in the mounted ChatView

### Requirement: Full-content cascade starts at the top

The cascade SHALL start from the first content row regardless of the chat's prior scroll position. It SHALL preserve the user's prior position for cleanup and SHALL not enter gather through an elapsed-time shortcut while unstruck rows remain.

#### Scenario: Existing chat is scrolled to the bottom
- **WHEN** Dashboard transition begins with `scrollTop > 0`
- **THEN** the original `scrollTop` SHALL be saved
- **AND** the chat scroll container SHALL immediately move to `scrollTop = 0`
- **AND** the first collision SHALL target the first visual content row

#### Scenario: Gather waits for all rows
- **WHEN** one or more cascade rows remain unstruck
- **THEN** elapsed animation time SHALL NOT cause gather to start
- **AND** normal gather SHALL start only after no unstruck row remains

#### Scenario: Scroll position restored on cleanup
- **WHEN** `TransitionCanvas` unmounts
- **THEN** the saved pre-transition scroll position SHALL be restored

### Requirement: Cascade targets are visible, non-empty, and unique

The cascade SHALL create targets only for visible non-empty text fragments and SHALL emit at most one impact for one rendered visual line.

#### Scenario: Blank text is skipped
- **WHEN** a collider contains only whitespace, non-breaking spaces, or an empty rendered line
- **THEN** it SHALL NOT produce a `CascadeRow`
- **AND** it SHALL NOT produce an impact ring, particles, or a cluster landing

#### Scenario: Nested clipped content is skipped
- **WHEN** a text fragment is clipped by a nested `overflow: auto`, `scroll`, `hidden`, or `clip` ancestor inside the chat scroll container
- **AND** less than half of its height is visible
- **THEN** it SHALL NOT produce a cascade target

#### Scenario: Inline fragments form one visual line
- **WHEN** inline text fragments overlap vertically by at least 60% of their smaller height
- **THEN** they SHALL form one `CascadeRow`
- **AND** that row SHALL be struck at most once

### Requirement: Parent collider lifecycle follows child completion

The cascade SHALL record each row's parent collider chain during initialization and SHALL destroy every parent frame or card exactly once when its pending descendant row count reaches zero.

#### Scenario: Card chrome leaves with its content
- **WHEN** the last target belonging to a message, tool, agent, code, table, quote, or nested text container completes
- **THEN** the container border, background, and remaining chrome SHALL disappear
- **AND** no empty frame SHALL remain visible

#### Scenario: Parent cleanup is idempotent
- **WHEN** one visual row contains multiple elements that share a parent collider
- **THEN** completing the row SHALL decrement that parent's pending count once
- **AND** the parent destruction animation SHALL run once

### Requirement: Long content uses bounded direct impacts

A content owner with at least eight effective visual rows SHALL use three direct impacts followed by a bounded attraction animation for all remaining rows.

#### Scenario: Long card attraction
- **WHEN** a content owner has at least eight effective visual rows
- **THEN** the first three selected rows SHALL receive the normal hop-step impact
- **AND** the remaining rows and owner chrome SHALL contract toward the third impact core over approximately 480ms
- **AND** a restrained set of theme-colored particles SHALL curve toward the same core

#### Scenario: Attraction completes before traversal continues
- **WHEN** a long content owner is absorbing
- **THEN** the cascade SHALL NOT select another row or enter gather
- **AND** after absorption completes it SHALL continue from the next pending owner

#### Scenario: Reduced motion
- **WHEN** `prefers-reduced-motion: reduce` is active
- **THEN** the transition SHALL complete without impact or attraction motion
