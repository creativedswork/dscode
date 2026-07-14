## MODIFIED Requirements

### Requirement: Scroll locking during animation
The TransitionCanvas SHALL lock ChatView scrolling for the duration of the animation using both a CSS class and programmatic overflow control. It SHALL additionally snapshot and restore the `scrollTop` of any inner scrollable container containing a struck element, preventing cumulative scroll drift during cascade.

#### Scenario: CSS scroll lock
- **WHEN** `transitionPhase` is `"animating"`
- **THEN** ChatView SHALL receive the `scrollLocked` prop
- **AND** ChatView SHALL apply `overflow: hidden` and `pointer-events: none` CSS

#### Scenario: Programmatic scroll lock
- **WHEN** TransitionCanvas initializes animation
- **THEN** it SHALL save the scroll container's current `scrollTop`
- **AND** set `scrollContainer.style.overflow = "hidden"`
- **AND** on cleanup, restore `scrollTop` and `overflow` to saved values

#### Scenario: Inner scroll container preservation during strike
- **WHEN** `strikeRow()` processes a row whose element has a scrollable ancestor (`overflow-y: auto` or `overflow-y: scroll`) between the element and the canvas container
- **THEN** before calling `destroyByType()`, it SHALL snapshot the scrollable ancestor's `scrollTop`
- **AND** after calling `destroyByType()`, it SHALL restore `scrollTop` to the snapshot value using `requestAnimationFrame`
- **AND** the scrollTop restore SHALL complete before the recalibration loop re-measures row positions via `getBoundingClientRect()`

#### Scenario: Scroll container resolution
- **WHEN** `scrollContainerRef.current` is null
- **THEN** TransitionCanvas SHALL fall back to ancestor traversal to find the nearest scrollable element

