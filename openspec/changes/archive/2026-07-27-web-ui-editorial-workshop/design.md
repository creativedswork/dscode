## Context

The current web UI was redesigned in `2026-05-29-warm-webui-redesign` (archived) to establish the warm design system. That redesign was purely visual — it replaced a cold dark theme with warm grays and amber accent, switched to Geist fonts, and flattened the component hierarchy. The current task builds on that foundation but goes further: it restructures the information architecture (sidebar, topbar, Dashboard), introduces a more editorial typographic identity, and adds new UI modules (Skills, Settings).

The prototype at `docs/prototypes/web-ui-editorial-workshop-plan-b.html` is the design source-of-truth from explore (supersedes v3).

## Goals / Non-Goals

**Goals:**
- Restructure the app shell: 38px topbar, 220px sidebar with expandable detail panels, main content with generous padding
- Replace the Dashboard `<select>` dropdown with a topbar pill mode switcher (Chat ↔ Dashboard) + transition overlay
- Redesign the empty state from a 400px info card to a full-viewport editorial welcome
- Introduce phase-labeled message groups (Thinking → Executing → Response) with animated dots
- Add Skills panel (Installed / Available / Marketplace)
- Add Settings panel (Appearance, Model, Vision, Cache)
- Shift accent from `#ca8a04` to `#b87503`
- Introduce spacing scale (xs/sm/md/lg/xl/2xl) and larger radius scale (sm/md/lg/xl)
- Enforce accent discipline: copper-gold accent limited to ≤3 elements per screen (brand mark, send button, user bubble)
- Expand serif font usage beyond empty state into panel titles and session names

**Non-Goals:**
- No WebSocket protocol changes
- No backend changes — purely frontend
- No new npm dependencies
- No changes to the TUI (`src/ui/`)
- No responsive breakpoint changes (existing mobile overlay behavior preserved)
- No changes to the cascade TransitionCanvas animation engine (just the trigger UI changes)
- Skill/plugin marketplace is UI-only placeholder — no backend marketplace integration

## Decisions

### D1: Sidebar restructured — Views removed, Dashboard moved to topbar

**Decision**: Remove the "Views" section (Chat, Dashboard) from the sidebar. Dashboard becomes a mode toggle in the topbar as a pill switcher (`[Chat → Dashboard]`). The sidebar now contains only Workspace (Sessions, MCP, Skills) + Settings footer.

**Rationale**: Dashboard is not a peer to Chat — it's a derived view generated *from* the conversation. Treating it as a sibling navigation item misrepresents the relationship. The topbar pill switcher communicates "same content, different lens" more accurately. This also frees sidebar real estate for Skills (future marketplace).

### D1b: Sidebar split into Create / Capabilities / Settings (Plan B)

**Decision**: The sidebar sections are semantically split: **Create** (Sessions — what you're working on), **Capabilities** (MCP + Skills — what tools and abilities you have), and **Settings** (footer button). This replaces the original single "Workspace" section that mixed Sessions, MCP, and Skills together.

**Rationale**: Sessions are creative artifacts (conversations you're building), while MCP servers and Skills are infrastructure (the agent's toolchain). Grouping them under one "Workspace" label conflates creation with configuration. The split creates a clearer mental model aligned with dscode's identity as a digital studio.

**Alternatives considered**:
- *Single Workspace section (v3 approach)*: Rejected — mixes creation and configuration concepts.
- *Separate Infrastructure section*: Rejected — "Capabilities" is more human-centered and accommodates future skill marketplace better.

### D1c: Brand diamond mark

**Decision**: The brand identifier in the topbar is an 8px rotated square (diamond) in accent color, replacing the 7px circle.

**Rationale**: The diamond shape visually connects the topbar brand mark to the empty state's brand mark (a larger rotated square), creating a consistent brand signature from chrome to content. A circle is generic; a diamond is distinctive and echoes the "Hackers and Painters" aesthetic — precise, angular, crafted.

**Alternatives considered**:
- *Keep Dashboard in sidebar*: Rejected — misrepresents the Chat→Dashboard relationship and clutters the sidebar.
- *Floating FAB to toggle Dashboard*: Overkill for a mode switch; the topbar is the natural home for view mode controls.

### D2: Sidebar detail panels expand inline (not replace main content)

**Decision**: Clicking Sessions, MCP, Skills, or Settings in the sidebar opens a 280px detail panel *between* the sidebar and main content. Only one panel open at a time. Clicking the active item again closes it.

**Rationale**: The current approach (switching the sidebar content area) limits each panel to ~220px which is too narrow for rich content like MCP tool lists or skill descriptions. A 280px expandable panel provides breathing room while keeping the main chat view visible. This pattern is used by VS Code, Linear, and Notion.

**Alternatives considered**:
- *Replace main content with panel*: Rejected — users should be able to reference MCP tools or sessions while chatting.
- *Modal dialogs*: Rejected — modals break flow; inline panels keep context.

### D3: Phase-labeled message groups

**Decision**: Add Thinking → Executing → Response phase labels above assistant message groups. Each label has an animated dot: pulsing when active, dimmed when complete.

**Rationale**: The current UI shows thinking text, tool cards, and results as sequential blocks without hierarchical grouping. Users have reported difficulty tracking which "phase" the AI is in during long turns. The phase labels provide lightweight semantic scaffolding — they don't add new functionality but make the existing mental model visible.

**Alternatives considered**:
- *Color-coded left borders*: Already partially in use (thinking block has a left border). Augmenting with labels is clearer.
- *Timeline-style indentation*: Overengineered for this use case.

### D4: Accent shift #ca8a04 → #b87503

**Decision**: Shift the primary accent from `#ca8a04` (bright amber-gold) to `#b87503` (deeper copper-gold).

**Rationale**: `#ca8a04` is the most common "warm accent" choice in AI-generated designs — it reads as "default warm." `#b87503` is slightly deeper, more copper-toned, and feels more intentional and tool-like. It maintains warmth while being more distinctive. This is a subtle change (ΔE ≈ 8) but makes a meaningful difference in brand perception.

### D5: Empty state as studio canvas

**Decision**: Replace the centered 400px info card with a full-viewport layout: large typography ("What would you like to *create* today?"), a diamond brand mark, a single-line subtitle, and capability pills (Write code, Refactor systems, Design interfaces, etc.).

**Rationale**: The empty state is the user's first impression of dscode. A 400px card saying "Type /help for commands" communicates "this is a CLI tool with a web wrapper." The editorial empty state communicates "this is a creative space — what do you want to make?" This aligns with dscode's identity as a digital studio.

### D6: Context Window bar kept in topbar (compact)

**Decision**: Keep the Context Window bar in the topbar center, but in a more compact form: a horizontal segmented bar (120px wide) with a token count label beside it. The detailed tooltip remains on hover.

**Rationale**: The current Context Window bar works but occupies significant header real estate. The compact variant keeps the information visible without dominating the topbar. This is a visual refinement, not a functional change.

### D7: Dashboard-mode contextual input

**Decision**: When in Dashboard mode, the input area shows contextual placeholder text ("Ask about this dashboard…") and hint text ("Dashboard mode — ask follow-up questions about this session").

**Rationale**: The current Dashboard is a read-only view. Adding a contextual input makes it an interactive exploratory surface — users can ask follow-up questions that reference the dashboard's data. This transforms Dashboard from a dead-end view into a branching exploration point.

### D8: Accent discipline — ≤3 uses per screen

**Decision**: The copper-gold accent (`#b87503`) SHALL appear on at most 3 elements per screen: the brand diamond mark (topbar), the send button (input area), and the user message bubble. All other interactive chrome (nav active states, phase dots, tool names, marketplace buttons, settings toggles) SHALL use `--text-secondary` or `--text-muted`.

**Rationale**: The original v3 prototype used accent on ~11 elements per screen, diluting its impact. The Open Design brand spec principle "one accent color, used at most twice per screen" forces visual restraint. Limiting accent to 3 key signal points (identity → action → self) makes each appearance meaningful and prevents the design from reading as generic warm-theme AI UI.

**Alternatives considered**:
- *Accent on 5+ elements*: Rejected — dilutes brand signal; looks like a default "warm amber" template.

### D9: Serif typographic extension

**Decision**: The serif display font stack (Iowan Old Style / Charter / Georgia) SHALL be used for structural labels beyond the empty state: panel header titles (15px), session item names (14px), dashboard metric values (28px). Sans (Geist) remains for body text and UI controls. Mono (Geist Mono) remains for code, labels, and technical identifiers.

**Rationale**: Serif type creates a meaningful distinction between "structural moments" (section headers, editorial content) and "operational UI" (buttons, inputs, body text). This three-tier typographic hierarchy (serif display → sans UI → mono labels) gives the interface a crafted, editorial feel that aligns with dscode's studio identity.

**Alternatives considered**:
- *Geist Sans for everything*: Rejected — functional but lacks personality and editorial contrast.

### D10: Phase dots use outline style

**Decision**: Phase indicator dots render as outline circles (`border: 1px solid var(--text-muted)`) rather than solid accent-filled circles. Active state fills with `--text-secondary`. This removes accent from the messaging flow.

**Rationale**: Phase dots are frequent, transient UI signals — coloring them with accent would make accent appear on nearly every screen. Outline style keeps them functional without competing for visual attention.

### D11: Chat scroll padding increased to 48px

**Decision**: The message area horizontal padding SHALL increase from `var(--space-lg)` (24px) to 48px.

**Rationale**: With the 220px sidebar + potential 280px detail panel open, the main content area narrows to ~700px on a 1440px screen. 48px padding keeps the text column at a comfortable 60-70 character width for readability.

### D12: Nav/session active states use text, not accent

**Decision**: Sidebar nav item active state SHALL use `--surface` background + `--text` color (no accent). Session item active state SHALL use `--surface` background + `--border-strong` border. Settings button active state SHALL use `--surface` background + `--border-strong` border.

**Rationale**: Active states need to signal "current location" without competing with the accent's reserved role (brand → action → self). Surface background shift + text weight change is sufficient for spatial orientation.

## Risks / Trade-offs

- **[Risk] Accent color change breaks visual consistency with docs/screenshots**: Existing screenshots and documentation will show the old amber. → **Mitigation**: The change is subtle (deep copper vs bright amber). Update screenshots as part of the change.
- **[Risk] Sidebar detail panels add DOM complexity**: Four panels (Sessions, MCP, Skills, Settings) with conditional rendering. → **Mitigation**: Panels are simple containers with `display: none/block` — no heavy framework. `togglePanel()` logic is ~10 lines.
- **[Risk] Phase labels may feel redundant in short turns**: A single quick response doesn't need Thinking/Executing/Response labels. → **Mitigation**: Phase labels only appear when there are distinct phases — quick responses skip directly to the Response label.
- **[Trade-off] Skills/Settings panels are UI-only in this change**: No backend wiring. → **Acceptable**: This change establishes the UI pattern. Backend wiring is a separate change.
