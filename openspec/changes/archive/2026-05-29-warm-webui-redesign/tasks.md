## 1. Design System Foundation

- [x] 1.1 Rewrite `web/tailwind.config.js` — replace `dscode-*` color tokens with warm stone/taupe gray palette (light: `#f8f7f5` bg, `#f3f2ef` surface, `#e6e4e0` border, `#2d2a26` text, `#ca8a04` accent; dark: `#1e1c19` bg, `#282622` surface, `#3a3732` border, `#e8e4dd` text), set Geist Sans as default sans font, Geist Mono + JetBrains Mono for mono, add `@phosphor-icons/react` dependency
- [x] 1.2 Rewrite `web/src/index.css` — define CSS custom properties for both themes (`:root` light, `.dark` dark), `@layer base` with warm defaults and Geist Sans body, `@layer components` with flat `.btn` (6px radius, no shadow, 1px border, accent bg for primary), `.input` (12px radius, 1px border, accent focus ring), `.card` (8px radius, 1px border, no shadow), `.tool-card` (8px radius, 1px border, muted pastel status colors), add `@keyframes fade-up` (opacity 0→1, translateY 12px→0, 600ms), update scrollbar to warm tones

## 2. Layout & Shell

- [x] 2.1 Update `web/src/components/App.tsx` header — warm amber title color, `1px solid border-bottom` separator, flat warm status indicator (muted pastel green/red), theme toggle button using Phosphor `Sun`/`Moon` icons, replace hand-rolled hamburger SVG with Phosphor `List` icon
- [x] 2.2 Add theme state management to `App.tsx` — `useState` for theme with localStorage persistence (`dscode-theme` key), `useEffect` to apply/remove `.dark` class on `<html>`, theme toggle handler

## 3. Conversation View

- [x] 3.1 Redesign `web/src/components/ChatView.tsx` message bubbles — user bubble: warm amber accent bg with white text, 12px radius; assistant bubble: warm surface bg, 1px solid border, 12px radius; proportional font (Geist Sans) for message text; fade-up entrance CSS class on new messages (gated behind `prefers-reduced-motion`)
- [x] 3.2 Redesign empty state in `ChatView.tsx` — warm welcome card with flat styling (12px radius, 1px border, warm surface bg), greeting in proportional font, amber accent for key text, helpful hints in muted color
- [x] 3.3 Update `WaitingBubble` in `ChatView.tsx` — warm-toned bounce dots (amber), proportional font timer, flat card styling
- [x] 3.4 Update `ThinkingBlock` in `ChatView.tsx` — muted warm styling, subtle left amber border accent, proportional font for summary label, improved collapsible disclosure
- [x] 3.5 Update `InlinePermission` in `ChatView.tsx` — muted pastel amber warning bg (replacing bright yellow), flat card (12px radius, 1px border), proportional font for text, flat action buttons (6px radius, no shadow)

## 4. Input Area

- [x] 4.1 Redesign `web/src/components/MessageInput.tsx` textarea — 12px radius (not pill), 1px solid border, warm surface bg, Geist Sans proportional font, amber border on focus (no glow, no shadow), updated placeholder text without emoji
- [x] 4.2 Redesign slash command popover in `MessageInput.tsx` — flat dropdown (8px radius, 1px border), warm surface bg, amber highlight for selected item, proportional font
- [x] 4.3 Redesign file picker popover in `MessageInput.tsx` — matching flat styling
- [x] 4.4 Update image thumbnail previews in `MessageInput.tsx` — 8px radius, 1px border, muted red remove button

## 5. Icons Migration

- [x] 5.1 Install `@phosphor-icons/react` and replace all hand-rolled inline SVG paths across all components — `ChatView.tsx` (warning icon in permission prompt), `Sidebar.tsx` (close, delete, expand icons), `App.tsx` (hamburger menu), `MessageInput.tsx` (file/folder icons), `PermissionDialog.tsx` (warning icon), `Toast.tsx` (info/error icons)
- [x] 5.2 Ensure consistent `strokeWidth` (1.5px or 2px Bold weight) across all Phosphor icons

## 6. Tool Cards & Markdown

- [x] 6.1 Redesign `web/src/components/ToolCard.tsx` — flat card (8px radius, 1px solid border), warm surface bg, amber accent for tool names in monospace, muted pastel green/red for success/error indicators (not bright green/red), smooth 200ms expand transition
- [x] 6.2 Update `web/src/components/Markdown.tsx` — code blocks with warm dark bg (or warm surface for light mode), amber accent for inline code, flat table borders (1px solid, warm border color), proportional font for body text

## 7. Sidebar & Panels

- [x] 7.1 Redesign `web/src/components/Sidebar.tsx` container — warm surface bg, `border-right: 1px solid` as separator, amber accent underline for active tab, proportional font for labels
- [x] 7.2 Update `SessionsPanel` in `Sidebar.tsx` — flat session cards (8px radius, 1px border on hover), proportional font, Phosphor `Trash` icon for delete
- [x] 7.3 Update `McpPanel` in `Sidebar.tsx` — muted pastel status badges (pale green for connected, pale amber for connecting, pale red for error), flat expandable tool list, monospace for tool names
- [x] 7.4 Update `SettingsPanel` in `Sidebar.tsx` — flat form controls (8px radius inputs/selects, 1px border, amber focus ring, no shadow), consistent spacing, proportional font for labels

## 8. Dialogs & Toasts

- [x] 8.1 Redesign `web/src/components/PermissionDialog.tsx` — flat modal (12px radius, 1px border, no shadow), warm surface bg, Phosphor `Warning` icon (amber, muted), flat action buttons (6px radius, no shadow), soft backdrop blur
- [x] 8.2 Redesign `web/src/components/Toast.tsx` — flat toast (8px radius, 1px border, no shadow), warm surface bg for info, muted pastel red bg for error, Phosphor icons for info/error, refined slide-in animation

## 9. Final Polish

- [x] 9.1 Update `web/index.html` — add Geist Sans and Geist Mono self-host or CDN font links, update title
- [x] 9.2 Full visual QA — verify all states (light/dark, empty/messages, streaming/complete, mobile/desktop, all panels and dialogs) render correctly with warm flat theme; verify `prefers-reduced-motion` disables all animations
- [x] 9.3 Verify no functionality regression — test chat, slash commands, file picker, image paste, permission flow, session management, config changes
- [x] 9.4 Run design-taste-frontend pre-flight checklist against the built UI — verify no cream/beige palette, no Inter font, no shadows, no pill shapes, single accent, consistent radius scale, Phosphor icons only, no emoji, no hand-rolled SVGs
