## Why

The current web UI uses a cold, dark GitHub-inspired color palette (`#0d1117` background, `#58a6ff` blue accent) that feels like a developer terminal rather than a warm, inviting human-computer interaction experience. The design prioritizes density over readability, lacks visual warmth, and misses opportunities for refined information presentation. This redesign transforms the interface into a clean, warm-toned, conversation-first experience that feels premium, approachable, and thoughtfully crafted for human interaction.

## What Changes

- **Warm color palette**: Replace cold dark blues with a warm monochrome+amber palette — cream/off-white backgrounds, warm grays, amber/gold accents, and soft brown borders. Dark mode shifts to deep warm browns instead of cold grays.
- **Cleaner typographic system**: Larger, more readable text with improved hierarchy. Reduce the "terminal" feel — move from monospace-first to proportional-first with monospace reserved for code/technical content only.
- **Refined message bubbles**: Softer, more organic bubble shapes with subtle shadows and improved spacing. Better visual distinction between user and assistant without harsh contrast.
- **Improved sidebar**: Redesign sidebar as a clean drawer with warm-toned surfaces, better grouping, and refined interaction states.
- **Enhanced input area**: A more inviting input field with rounded pill shape, subtle glow on focus, and refined slash/file menus with softer styling.
- **Polished animations**: Add subtle entrance animations, hover transitions, and micro-interactions (message appear, tool card expand, permission dialog fade) using CSS transitions and lightweight keyframes.
- **Better information architecture**: Tool cards get a cleaner inline presentation. Thinking blocks are more refined. Permission dialogs feel less alarming. Toasts are softer.
- **Warm empty state**: Replace the dark empty state with a warmer, more welcoming onboarding card.
- **System-aware theming**: Light mode as default with a smooth dark mode that uses warm deep tones instead of cold grays.

## Capabilities

### New Capabilities
- `warm-design-system`: A complete warm-toned design system with color tokens, typography scale, spacing rhythm, animation presets, and component-level styles that replace the existing cold-dark Tailwind config.

### Modified Capabilities
- `web-frontend`: All visual requirements (theme support, responsive layout, conversation view, input area, sidebar) remain functionally identical but their visual specification changes to the warm design system. The theme requirement shifts from generic light/dark toggle to warm light + warm dark modes.

## Impact

- `web/tailwind.config.js`: Full color palette replacement, new font configuration
- `web/src/index.css`: Rewritten component classes, new animations, updated scrollbar styling
- `web/src/components/App.tsx`: Header styling, layout adjustments
- `web/src/components/ChatView.tsx`: Message bubbles, empty state, thinking blocks, waiting indicator
- `web/src/components/MessageInput.tsx`: Input styling, slash/file menu popovers
- `web/src/components/Sidebar.tsx`: Panel redesign, tab styling, session cards
- `web/src/components/ToolCard.tsx`: Card styling, status indicators
- `web/src/components/PermissionDialog.tsx`: Modal styling
- `web/src/components/Toast.tsx`: Toast appearance
- `web/src/components/Markdown.tsx`: Code blocks, tables, inline code
- `web/index.html`: Updated font imports (add serif/display font option)
- WebSocket protocol: **No changes** — the redesign is purely visual
