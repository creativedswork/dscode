## Why

When the user is in Dashboard mode and switches to a different session, the dashboard content stays frozen on the previous session's data — it neither refreshes nor returns to Chat mode. Additionally, every switch to Dashboard mode triggers a fresh LLM generation with loading animation, even when the session content hasn't changed at all. This wastes API calls and creates unnecessary waiting.

## What Changes

- **Session switch in Dashboard mode returns to Chat**: When the user switches sessions while viewing a dashboard, the view mode automatically resets to Chat, showing the new session's conversation.
- **Dashboard caching with content hash**: Dashboard HTML is cached per session in localStorage, keyed by a `contentHash` derived from the session's actual message content. If the session content hasn't changed, the cached dashboard renders instantly without an LLM call.
- **Backend provides contentHash**: The backend computes a content hash from session messages during `saveSession()` and exposes it in `SessionInfo` so the frontend can validate cached dashboards.

## Capabilities

### New Capabilities
- `dashboard-cache`: Caching and persistence of generated dashboard HTML per session, keyed by content hash, including localStorage persistence and cache invalidation on content change.

### Modified Capabilities
- `session-view-mode`: When `currentSessionId` changes while `viewMode` is "dashboard", the view mode resets to "chat".
- `session-management`: `SessionMetadata` gains a `contentHash: string` field, computed during `saveSession()` from message content.
- `session-dashboard`: The "re-generates on each switch" requirement is relaxed — dashboard re-uses cached HTML when the session's `contentHash` matches.

## Impact

- `src/session/types.ts` — add `contentHash` to `SessionMetadata`
- `src/session/manager.ts` — compute contentHash in `saveSession()`
- `src/ui/shared/types.ts` — add `contentHash` to `SessionInfo`
- `src/ui/web/web-backend.ts` — map `contentHash` in session list response
- `web/src/components/App.tsx` — session-switch → chat reset, dashboard cache logic, localStorage persistence
