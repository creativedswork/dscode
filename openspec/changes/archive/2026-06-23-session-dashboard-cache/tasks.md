## 1. Backend: contentHash in SessionMetadata

- [x] 1.1 Add `contentHash: string` field to `SessionMetadata` interface in `src/session/types.ts`
- [x] 1.2 Add `contentHash` to `SessionInfo` interface in `src/ui/shared/types.ts`
- [x] 1.3 In `src/session/manager.ts`, import `crypto` from `node:crypto` and compute contentHash in `saveSession()`: hash `messages.map(m => `${m.role}:${String(m.content ?? '').slice(0,200)}`).join('|')` with SHA-256, store first 12 hex chars in `this.current.contentHash`
- [x] 1.4 In `src/ui/web/web-backend.ts`, map `contentHash` through in `handleSession("list")` and `handleSession("load")` session list responses

## 2. Frontend: Session switch resets to Chat mode

- [x] 2.1 Add `prevSessionIdRef` in `App.tsx` to track previous `currentSessionId`
- [x] 2.2 Add `useEffect` that watches `currentSessionId`: when it changes and `viewMode === "dashboard"`, reset `viewMode` to `"chat"` (skip on first assignment from null)
- [x] 2.3 Remove `key={viewMode}` from the view mode container `<div>` (once session switch resets to chat, the key is no longer needed to force remount on mode switch)

## 3. Frontend: Dashboard cache with localStorage

- [x] 3.1 Add `dashCacheRef` (`useRef<Record<string, { contentHash: string; html: string }>>`) and load from localStorage on mount (key: `dscode-dash-cache`)
- [x] 3.2 In `handleViewModeChange`, when switching to Dashboard: check cache for current session; if found AND `cached.contentHash === sessions.find(s => s.id === currentSessionId)?.contentHash`, set `artifactHtml` directly and skip `artifact generate` command
- [x] 3.3 In `handleEvent`, on `artifact_end`: write current `artifactHtml` + session's `contentHash` to cache ref, persist to localStorage via `JSON.stringify`
- [x] 3.4 Enforce 20-entry cache limit: when adding a new entry would exceed 20, evict the oldest entry before insertion
- [x] 3.5 Add `artifactHtmlRef` to capture streaming `artifactHtml` value for cache write, avoiding stale closure in `handleEvent`

## 4. Validation

- [ ] 4.1 Verify: switch to Dashboard for session A → generate → switch to Chat → switch back to Dashboard → instant render (cache hit)
- [ ] 4.2 Verify: send a message in session A (content changes) → switch to Dashboard → regenerate (cache miss)
- [ ] 4.3 Verify: in Dashboard mode for session A → click session B in sidebar → view resets to Chat with session B
- [ ] 4.4 Verify: close browser and reopen → navigate to session A → switch to Dashboard → instant render (localStorage cache hit)
