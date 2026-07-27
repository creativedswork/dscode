## Why

The current web UI, while functional and clean, lacks the distinctive identity that dscode's brand promises — "a digital studio for content-driven creation, built in the spirit of Hackers and Painters." The warm amber-on-stone palette, flat card-based messaging, and standard three-panel layout feel like a well-executed but generic AI chat client rather than a creative workshop. The empty state is a 400px informational card rather than an invitation to create. The spatial hierarchy is flat, the typography lacks drama, and existing features like the Chat→Dashboard cascade transition feel bolted on rather than integrated into the design language. As dscode expands toward a skill marketplace and richer MCP integration, the UI needs a more intentional spatial and typographic system that can grow with these features.

## What Changes

- **Editorial Workshop identity**: Replace the generic "AI chat client" feel with an intentional studio/workshop aesthetic — generous whitespace, dramatic typographic scale (28px empty-state titles vs 9px labels), and a sense of entering a creative space rather than opening a tool.
- **Refined color system**: Shift the accent from `#ca8a04` (amber-gold, a common AI warm-default) to `#b87503` (deeper copper-gold) for a more distinctive, tool-like warmth. Keep the warm stone neutral base.
- **Empty state as studio canvas**: Replace the informational card with a full-viewport editorial welcome: large typography ("What would you like to *create* today?"), subtle brand mark, and capability pills.
- **Slimmer topbar (38px)**: Reduce the header from a thick toolbar to a thin status bar with the Chat↔Dashboard mode switcher, compact Context Window bar, and connection status.
- **Sidebar restructuring**: Remove "Views" (Chat/Dashboard) from sidebar — Dashboard is a mode of Chat, not a sibling. Sidebar split into **Create** (Sessions — what you're working on), **Capabilities** (MCP + Skills — your agent's toolchain), and **Settings** (footer). Detail panels (Sessions list, MCP servers, Skills list, Settings) expand inline as 280px panels to the right of the sidebar.
- **Phase-labeled message groups**: Introduce Thinking → Executing → Response phase labels with animated dots to visually distinguish AI mental modes.
- **Dashboard as mode transition**: The Chat→Dashboard relationship is a mode switch in the topbar (pill toggle), with a particle transition overlay representing the existing cascade animation. Dashboard has its own contextual input area ("Ask about this dashboard…").
- **Skill management panel**: A structured panel with Installed / Available sections and a Marketplace entry point, laying UI groundwork for future skill installation and discovery.
- **Settings panel**: Consolidated settings in a sidebar detail panel (Appearance, Model, Vision, Cache) matching the existing dscode settings model.

## Capabilities

### New Capabilities
- `editorial-workshop-layout`: The new spatial and typographic system — topbar (38px), sidebar (220px, split into Create/Capabilities/Settings + expandable panels), main content area with 48px padding. Phase-labeled message groups with outline-style dots. Empty state as studio canvas with serif typography. Accent discipline (≤3 uses per screen).
- `skill-management-ui`: Sidebar panel for browsing installed skills, discovering available skills, and accessing a future Skill Marketplace. Includes skill cards with install/active toggles.
- `settings-panel-ui`: Sidebar detail panel for Appearance (theme), Model (provider/model selection), Vision (OCR model, proxy toggle), and Cache (usage stats, clear button).

### Modified Capabilities
- `web-frontend`: All layout, typography, color, sidebar structure, and empty state requirements change to the editorial workshop design system. The Dashboard requirement changes from a `<select>` dropdown toggle to a topbar pill switcher with transition overlay.
- `warm-design-system`: Color tokens change: `--color-accent` shifts from `#ca8a04` to `#b87503`. New spacing tokens (xs/sm/md/lg/xl/2xl) and radius scale (sm/md/lg/xl) introduced. Topbar height standardized to 38px.

## Impact

- `web/src/index.css`: Rewritten CSS custom properties, new component classes (phase-label, settings-row, skill-card, debug-bar removal), updated animations
- `web/src/components/App.tsx`: Header restructured, Chat↔Dashboard mode switcher moved to topbar, sidebar panel toggling, Settings panel wiring
- `web/src/components/ChatView.tsx`: Phase labels added to message groups, empty state redesigned
- `web/src/components/Sidebar.tsx`: Removed Views section, restructured to Workspace-only + Settings footer, expandable detail panels for Sessions/MCP/Skills/Settings
- `web/src/components/ViewModeSwitcher.tsx`: Replaced with topbar pill toggle
- `web/src/components/MessageInput.tsx`: Dashboard-mode contextual input
- `web/src/components/ContextWindowBar.tsx`: Compact inline variant
- `web/tailwind.config.js`: Updated color/spacing tokens
- New: `web/src/components/SkillsPanel.tsx`, `web/src/components/SettingsPanel.tsx`
- Prototype: `docs/prototypes/web-ui-editorial-workshop-plan-b.html` (supersedes v3)
