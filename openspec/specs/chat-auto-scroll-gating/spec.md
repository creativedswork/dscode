## ADDED Requirements

### Requirement: Auto-scroll gates on user scroll position
The ChatView SHALL only auto-scroll to the bottom when the user's current scroll position is at or near the bottom of the conversation scroll container. When the user has manually scrolled away from the bottom, auto-scroll SHALL be suppressed until the user scrolls back to the bottom.

#### Scenario: Auto-scroll follows when user is at bottom during streaming
- **WHEN** a new message delta arrives during streaming AND the user's scroll position is within 64px of the container bottom (`scrollTop + clientHeight >= scrollHeight - 64`)
- **THEN** the view auto-scrolls to the bottom using `scrollIntoView({ behavior: "instant" })`

#### Scenario: Auto-scroll suppressed when user scrolls away during streaming
- **WHEN** a new message delta arrives during streaming AND the user has manually scrolled up more than 64px from the container bottom
- **THEN** the view does NOT auto-scroll; the user's scroll position remains unchanged

#### Scenario: Auto-scroll follows when user is at bottom while idle
- **WHEN** a state change triggers the scroll effect (e.g., `processing` toggles, `permissionPrompt` appears) while the conversation is not streaming AND the user's scroll position is within 64px of the container bottom
- **THEN** the view auto-scrolls to the bottom using `scrollIntoView({ behavior: "smooth" })`

#### Scenario: Auto-scroll suppressed when user scrolls away while idle
- **WHEN** a state change triggers the scroll effect while the conversation is not streaming AND the user has manually scrolled up more than 64px from the container bottom
- **THEN** the view does NOT auto-scroll; the user's scroll position remains unchanged

#### Scenario: Auto-scroll re-engages on next render when user scrolls back to bottom
- **WHEN** the user manually scrolls back to within 64px of the container bottom after having scrolled away
- **THEN** the `isAtBottom` ref is set to `true`, and on the next React render (from the next state change) the `useLayoutEffect` SHALL scroll to the bottom, re-engaging the follow behavior

#### Scenario: Immediate snap-to-bottom when scrolling to bottom during streaming
- **WHEN** the user manually scrolls back to within 64px of the container bottom during active streaming (hasStreaming is true), transitioning `isAtBottom` from false to true
- **THEN** a `requestAnimationFrame` callback SHALL immediately call `scrollIntoView({ behavior: "instant" })` on the bottom sentinel, snapping the user to the very latest content without waiting for the next token delta

#### Scenario: Initial load auto-scrolls to bottom
- **WHEN** the ChatView component mounts with an empty or initial message list
- **THEN** auto-scroll behavior is enabled by default (treated as "at bottom"), so the first messages that appear trigger auto-scroll

### Requirement: At-bottom detection uses scroll geometry
The ChatView SHALL determine "at bottom" by comparing the scroll container's geometry on every scroll event: `scrollTop + clientHeight >= scrollHeight - THRESHOLD`. The threshold SHALL be 64px. The detection state SHALL be stored in a `useRef` to avoid re-renders on scroll.

#### Scenario: Scroll event updates at-bottom state
- **WHEN** the user scrolls the conversation container
- **THEN** the `isAtBottom` ref is updated synchronously from the `onScroll` handler without triggering a React re-render

#### Scenario: Threshold accounts for minor layout shifts
- **WHEN** a streaming message causes a small layout shift (e.g., thinking block expand/collapse) and the user's effective position is still at the visual bottom
- **THEN** the 64px threshold prevents auto-scroll from being incorrectly suppressed
