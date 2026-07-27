## Prototype

The design for this change was explored and validated through an interactive HTML prototype during the explore phase.

### File

`docs/prototypes/web-ui-editorial-workshop-plan-b.html` (supersedes v3)

### What it demonstrates

- **Empty state**: Editorial welcome with diamond brand mark, large title, and capability pills
- **Chat view**: Phase-labeled message groups (Thinking → Executing → Response) with animated dots
- **Tool execution**: Tool cards with running/done states, elapsed timers, expandable bodies
- **Permission dialog**: Inline permission prompt with Allow/Deny buttons
- **Dashboard mode**: Dashboard view with metric cards and contextual input
- **Chat↔Dashboard transition**: Particle overlay animation bridging chat and dashboard
- **Sidebar (Plan B)**: Create/Capabilities/Settings split with expandable 280px detail panels
- **Settings panel**: Appearance, Model, Vision, and Cache sections
- **Skill management**: Installed/Available skill cards with install toggles and Marketplace banner
- **Context Window bar**: Compact segmented bar in topbar center
- **Debug state bar**: Auto-hiding preview controls for iterating between UI states
- **Accent discipline**: Copper-gold accent limited to brand diamond, send button, and user bubble (≤3 per screen)
- **Serif typographic extension**: Panel titles, session names, and dashboard values use serif display font
- **Brand diamond mark**: 8px rotated square in topbar, echoing the empty state brand mark
- **Phase dot outline style**: Phase indicator dots use outline circles instead of solid accent fill

### How to use

Open the HTML file in a browser. The bottom-right corner has an auto-hiding `◉ Preview` bar (opacity 18%, full on hover) that switches between states: Empty, Chatting, Thinking, Tool Exec, Done, Permission, and Chat→Dash transition.
