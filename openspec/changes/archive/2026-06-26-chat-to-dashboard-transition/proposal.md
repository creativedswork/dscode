## Why

DSCode users switch between Chat and Dashboard views to gain analytical perspective on their sessions. Without a crafted transition, this mode switch is an abrupt visual jump that breaks immersion and fails to express the product's "deconstruct → reconstruct" brand narrative. The Chat → Dashboard transition addresses this with a signature Canvas animation that dismantles the chat UI line-by-line through a hop-step letter cluster, dissolves content into particles, and reforms them into the DSCode wordmark — bridging the two modes with intentional, physical motion.

## What Changes

- **TransitionCanvas**: Full-viewport transparent Canvas overlay (z-index: 50) running a multi-phase particle physics animation over a live, visible ChatView DOM
- **Hop-step cluster system**: Six letters ("dscode") as a unified impact body that cascades row-by-row through chat content with squash/stretch deformation, dwell pauses, and viewport-constrained arc hopping
- **DOM destruction matrix**: Six per-type destruction effects (text-line scatter, code-line corruption, tool-header scatter, tool-result-line scatter, tool-card clip-path collapse, message-card shatter) triggered on cluster impact, with layout-freeze to prevent reflow
- **Three-phase state machine**: cascade (cluster hops through rows, destroying DOM) → gather (particles converge to wordmark) → formed (particles hold position with water-ripple micro-motion, wait for dashboard artifact)
- **Particle system**: ≤2500 particles with fall/gather/formed physics, impact rings, screen shake, and water-ripple idle animation
- **Dashboard readiness coordination**: Artifact generation fires immediately on transition start; animation waits in formed phase until content is ready + 600ms settle
- **Scroll locking**: Two-layer lock (CSS class + programmatic overflow:hidden) prevents user scroll interaction during animation
- **Cache bypass**: Dashboard-cache hits and `prefers-reduced-motion` skip animation entirely
- **ESC skip**: ESC key in cascade phase jumps directly to gather
- **Warm design system integration**: All animation colors derived from CSS custom properties; letter colors match accent/purple/yellow/text/teal palette

## Capabilities

### New Capabilities

- `chat-dashboard-transition`: Canvas-based cascade animation triggered when switching from Chat to Dashboard mode, featuring hop-step letter cluster striking live DOM elements, per-type destruction effects, particle convergence to DSCode wordmark, and coordinated dashboard artifact loading

### Modified Capabilities

- `web-frontend`: TransitionCanvas component, data-collider DOM attributes on ChatView text/code/tool elements, scroll container ref forwarding, animation CSS keyframes
- `session-view-mode`: Transition phase state machine (`transitionPhase` ∈ {idle, animating}) defers view mode switch until animation completes AND artifact is ready; cache-hit and reduced-motion paths bypass animation
- `artifact-system`: Artifact generation fires in parallel during animation; formed phase polls artifact readiness
- `dashboard-cache`: Cache-hit path triggers instant view switch (no animation)

## Impact

- **Affected components**: `TransitionCanvas.tsx` (~1217 lines), `App.tsx` (transition state machine), `ChatView.tsx` (data-collider attributes), `ArtifactContainer.tsx`, `ViewModeSwitcher.tsx`, `Markdown.tsx`, `ToolCard.tsx`, `index.css` (CSS keyframes + theme variables)
- **No API changes**: All animation is client-side; WebSocket protocol and artifact generation flow unchanged
- **Performance**: 60fps target, DPR capped at 2, particle cap at 2500, dt clamped at 33ms, offscreen canvas for wordmark rasterization, CSS animations for text/code destruction
- **Dependencies**: None new — Canvas 2D API (browser built-in)
