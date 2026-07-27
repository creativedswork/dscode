## 1. Design tokens and CSS foundation

- [x] 1.1 Update `--color-accent` from `#ca8a04` to `#b87503` in `web/src/index.css`, including dependent tokens (accent-hover, accent-bg, accent-glow, user-bubble) and dark mode equivalents
- [x] 1.2 Add spacing scale tokens: `--space-xs` (4px), `--space-sm` (8px), `--space-md` (16px), `--space-lg` (24px), `--space-xl` (40px), `--space-2xl` (64px)
- [x] 1.3 Update radius scale: `--radius-sm` (6px), `--radius-md` (10px), `--radius-lg` (16px), `--radius-xl` (20px)
- [x] 1.4 Add `--topbar-h: 38px` token
- [x] 1.5 Add CSS classes for phase labels (`.phase-label`, `.phase-dot`, `.phase-text`, `@keyframes phasePulse`)
- [x] 1.6 Add CSS classes for settings panel (`.settings-row`, `.settings-label`, `.settings-select`, `.settings-check`, `.settings-card`, `.settings-danger-btn`)
- [x] 1.7 Add CSS classes for skill cards (`.skill-card`, `.skill-icon`, `.skill-tag`, `.skill-action`, `.market-banner`)
- [x] 1.8 Update Tailwind config color/spacing references to match new tokens
- [x] 1.9 Run `npm run typecheck`

## 2. Topbar restructure

- [x] 2.1 Reduce topbar height to 38px, update padding and alignment
- [x] 2.2 Replace `ViewModeSwitcher.tsx` `<select>` dropdown with a pill-style button group (`[Chat → Dashboard]`)
- [x] 2.3 Hide mode switcher when `messages.length === 0`; show when messages exist
- [x] 2.4 Keep Context Window bar in topbar center (compact variant)
- [x] 2.5 Move connection status chip to topbar right
- [x] 2.6 Wire Dashboard mode switch to trigger `TransitionCanvas` and update `viewMode` state

## 3. Sidebar restructure

- [x] 3.1 Remove "Views" section (Chat, Dashboard nav items) from `Sidebar.tsx`
- [x] 3.2 Restructure to single "Workspace" section: Sessions, MCP, Skills (with count badges)
- [x] 3.3 Add Settings button in sidebar footer area with gear icon
- [x] 3.4 Implement expandable detail panel system: clicking nav item opens 280px panel between sidebar and main content; only one open at a time; re-click closes
- [x] 3.5 Wire Sessions detail panel (session list, new session button, active indicator)
- [x] 3.6 Wire MCP detail panel (server cards with status dots, expandable tool lists)

## 4. Skills panel

- [x] 4.1 Create `SkillsPanel.tsx` component with Installed and Available sections
- [x] 4.2 Implement Installed skill cards (green icon, name, description, tags, "Active" badge)
- [x] 4.3 Implement Available skill cards (purple icon, name, description, tags, "Install" button)
- [x] 4.4 Add Marketplace banner (dashed border, puzzle icon, "Browse Marketplace" button)
- [x] 4.5 Wire Skills nav item in sidebar to open Skills detail panel

## 5. Settings panel

- [x] 5.1 Create `SettingsPanel.tsx` component with sections: Appearance, Model, Vision, Cache
- [x] 5.2 Implement Appearance section: Theme selector (Light/Dark) using existing `setTheme`
- [x] 5.3 Implement Model section: Provider dropdown (deepseek/qwen/kimi) and Model dropdown
- [x] 5.4 Implement Vision section: OCR Model dropdown and "Proxy images through vision model" checkbox
- [x] 5.5 Implement Cache section: display session/file cache stats, "Clear All Cache" button
- [x] 5.6 Wire Settings footer button in sidebar to open Settings detail panel

## 6. Empty state redesign

- [x] 6.1 Replace the current 400px info card in `ChatView.tsx` with editorial welcome layout
- [x] 6.2 Implement diamond brand mark (rotated square in accent color on accent-soft circle)
- [x] 6.3 Add large title: "What would you like to **create** today?" (28px, weight 300, "create" weight 600)
- [x] 6.4 Add subtitle describing dscode
- [x] 6.5 Add capability pills (Write code, Refactor systems, Design interfaces, Analyze data, Run commands)

## 7. Phase-labeled message groups

- [x] 7.1 Add phase label component: dot (pulsing animation when active, dimmed when done) + text label (Thinking/Executing/Response)
- [x] 7.2 Wire Thinking phase: show when thinking content is streaming, mark done when complete
- [x] 7.3 Wire Executing phase: show when tool calls are in progress, mark done when all complete
- [x] 7.4 Wire Response phase: show when assistant text is streaming
- [x] 7.5 Skip Thinking/Executing labels for simple responses (only show Response)

## 8. Dashboard contextual input and transition

- [x] 8.1 Add contextual input area in Dashboard view with placeholder "Ask about this dashboard…"
- [x] 8.2 Add hint text "Dashboard mode — ask follow-up questions about this session"
- [x] 8.3 Add "← Back to Chat" button in dashboard header
- [x] 8.4 Ensure existing cascade `TransitionCanvas` animation fires on Chat→Dashboard switch via the new topbar pill

## 9. Integration and cleanup

- [x] 9.1 Wire all new components into `App.tsx` (SkillsPanel, SettingsPanel, phase labels, new sidebar structure)
- [x] 9.2 Remove unused `ViewModeSwitcher.tsx` references and file
- [x] 9.3 Update `MessageInput.tsx` for Dashboard-mode contextual placeholder/hint
- [x] 9.4 Run `npm run build` and verify no regressions
- [x] 9.5 Test all existing flows: send message, receive response, thinking display, tool cards, permission dialogs, session switching, MCP, theme toggle, cascade transition
