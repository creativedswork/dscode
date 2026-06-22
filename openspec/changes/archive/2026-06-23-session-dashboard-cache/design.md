## Context

The dashboard feature (`session-dashboard`) generates HTML via LLM when the user switches to Dashboard mode. Currently this generation happens on every switch, even for the same session with unchanged content. Additionally, when the user switches sessions while in Dashboard mode, the view stays in Dashboard but shows stale content from the previous session.

We need to:
1. Reset view mode to Chat when switching sessions
2. Cache generated dashboard HTML per session, keyed by a content hash
3. Persist the cache in localStorage so it survives app restarts

## Goals / Non-Goals

**Goals:**
- Dashboard renders instantly when session content hasn't changed (cache hit)
- Cache invalidates reliably when session content changes
- Session switch in Dashboard mode goes back to Chat mode
- Cache survives browser close/reopen via localStorage

**Non-Goals:**
- Pre-generating dashboards for inactive sessions
- Sharing dashboard cache across devices
- Caching partial/incomplete dashboard generations
- Dashboard cache for any artifact context other than `session_dashboard`

## Decisions

### Decision 1: contentHash computed in saveSession()

The hash is computed from serialized message content using Node's `crypto.createHash('sha256')`, taking the role and first 200 characters of each message's content string. This is fast enough to run on every save and sensitive enough to detect any meaningful content change.

**Alternatives considered:**
- **Hash full messages**: Too slow for large sessions
- **Use messageCount + updatedAt**: updatedAt could change for non-content reasons
- **Let frontend compute hash**: Frontend doesn't have messages for non-active sessions

### Decision 2: localStorage for cache persistence

Structure: `localStorage["dscode-dash-cache"] = JSON.stringify({ [sessionId]: { contentHash, html } })`

The contentHash in the cache is compared against `SessionInfo.contentHash` from the server. If they match, the cached HTML is used directly.

**Alternatives considered:**
- **IndexedDB**: Overkill for this use case; single JSON blob is simpler
- **In-memory only (Map)**: Loses cache on page refresh — poor UX
- **SessionStorage**: Loses cache on tab close — same problem

### Decision 3: Session switch → Chat via useEffect

A `useEffect` in App.tsx watches `currentSessionId`. When it changes and `viewMode === "dashboard"`, it resets `viewMode` to `"chat"`. A ref tracks the previous sessionId to avoid triggering on initial mount.

This is cleaner than modifying every code path that changes `currentSessionId`.

**Alternatives considered:**
- **Inline in handleEvent"sessions" case**: Mixes concerns; useEffect is more declarative
- **In Sidebar's onClick**: Doesn't cover all session-switch paths (e.g., slash commands, API)

### Decision 4: Cache check in handleViewModeChange

When switching to Dashboard mode, before sending the `artifact generate` command, check:
1. Is there a cache entry for `currentSessionId`?
2. Does `cache[sessionId].contentHash === sessionInfo.contentHash`?

If both true → set `artifactHtml` directly, skip generate.
If false → proceed with normal generate flow.

On `artifact_end`, write the final HTML + contentHash into cache and persist to localStorage.

### Decision 5: Cache invalidation on content change is automatic

No explicit dirty flag needed. The `contentHash` comparison naturally handles this: when session content changes, `SessionInfo.contentHash` from the server will differ from the cached hash, triggering regeneration.

## Risks / Trade-offs

- **localStorage size limit (~5MB)**: Dashboard HTML is typically <100KB. Even 50 sessions would be ~5MB. Mitigation: limit cache to most recent 20 sessions.
- **Hash collision**: SHA-256 truncated to 12 hex chars has 48 bits of entropy. Collision probability is negligible for practical session counts.
- **localStorage cleared by user/browser**: Graceful fallback — just regenerates dashboard.
- **contentHash computed on every save**: SHA-256 on serialized message previews is sub-millisecond. Acceptable overhead.
