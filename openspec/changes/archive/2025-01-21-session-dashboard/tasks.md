## 1. Shared Types & Protocol

- [x] 1.1 Add `artifact_start` / `artifact_delta` / `artifact_end` to `ServerEvent` type in `src/ui/shared/types.ts`
- [x] 1.2 Add `artifact` command to `ClientCommand` type: `{ type: "artifact"; action: "generate" | "update"; context?: string; instruction?: string }`
- [x] 1.3 Run `npm run typecheck` after type changes to catch downstream errors early

## 2. Backend: Artifact Command Handler

- [x] 2.1 Create artifact command router: parse `artifact` client command from WebSocket message handler
- [x] 2.2 Implement `generate` action: build prompt with `html_output_skill` injection + session summary, launch independent LLM call, stream `artifact_start` / `artifact_delta` / `artifact_end`
- [x] 2.3 Implement `update` action: take existing artifact HTML + user instruction, rebuild prompt, stream new artifact
- [x] 2.4 Implement `.dscode/html_output_skill` file reading and prompt injection (graceful fallback if file absent)
- [x] 2.5 Ensure artifact LLM call is fully independent from main agent (separate context, does not affect `processing` state, does not modify conversation messages)

## 3. Frontend: View Mode Switcher

- [x] 3.1 Add `viewMode: "chat" | "dashboard"` state and `setViewMode` to `App.tsx`
- [x] 3.2 Create `web/src/components/ViewModeSwitcher.tsx`: `<select>` styled with warm design tokens, Phosphor `Chat` / `ChartBar` icons
- [x] 3.3 Implement responsive: `hidden sm:inline` for mode name label on viewports < 768px
- [x] 3.4 Insert ViewModeSwitcher into Header right zone (left of ThemeToggle)

## 4. Frontend: ArtifactContainer

- [x] 4.1 Create `web/src/components/ArtifactContainer.tsx` with props: `html: string`, `loading: boolean`
- [x] 4.2 Implement iframe rendering: `srcdoc={html}`, `sandbox="allow-same-origin"`, full width/height
- [x] 4.3 Implement loading state: spinner/skeleton between `artifact_start` and `artifact_end`
- [x] 4.4 Implement empty state: "Waiting for dashboard generation..." when not loading and no HTML

## 5. Frontend: App Integration

- [x] 5.1 Add `artifactHtml: string` and `artifactLoading: boolean` state to App
- [x] 5.2 Handle `artifact_start` event: reset `artifactHtml` to `""`, set `artifactLoading = true`
- [x] 5.3 Handle `artifact_delta` event: append delta to `artifactHtml`
- [x] 5.4 Handle `artifact_end` event: set `artifactLoading = false`
- [x] 5.5 Main area conditional rendering: `ArtifactContainer` when `viewMode === "dashboard"`, `ChatView` when `viewMode === "chat"`
- [x] 5.6 On `viewMode` change to `"dashboard"`: send `{ type: "artifact", action: "generate", context: "session_dashboard" }`

## 6. Frontend: Pure-Instruction Input in Dashboard Mode

- [x] 6.1 Modify MessageInput or App to route sends differently based on `viewMode`
- [x] 6.2 When `viewMode === "dashboard"`, send `{ type: "artifact", action: "update", instruction }` instead of `{ type: "chat", text }`
- [x] 6.3 Change placeholder to "Describe how to modify the dashboard..." in dashboard mode
- [x] 6.4 Hide slash commands panel when `viewMode === "dashboard"`

## 7. Polish & Verify

- [x] 7.1 Add 300ms CSS fade transition on main area when switching views
- [ ] 7.2 Verify Dashboard mode works in both light and dark warm themes (iframe inherits through `color-scheme` meta or inline style)
- [x] 7.3 Run `npm run typecheck` and fix any type errors
- [x] 7.4 Run `npm run build:web` to verify production build
- [ ] 7.5 Manual test: session with messages → switch to Dashboard → verify LLM generates HTML → type instruction → verify update → switch back to Chat → verify conversation intact
