## Context

The Web UI (`ChatView.tsx`) displays a hardcoded `"09:41"` time string on every chat message meta line (`You · 09:41` / `dscode · 09:41`). The `UIMessage` type in `src/ui/shared/types.ts` has no timestamp field, so there is no data to drive a real timestamp. This makes message times misleading and useless.

The current data flow:
- `UIMessage` interface has `id`, `role`, `content`, `thinking`, `tools`, `isStreaming`, `images` — no timestamp
- `conversationReducer` creates messages in `user_message`, `updateLastOrCreate`, and `ready` cases without recording creation time
- `ChatView.tsx` `UserBubble` (line 369) and `AssistantMessage` (line 412) both hardcode `"09:41"`

Constraints:
- `UIMessage` is shared between TUI and Web UI; TUI does not display per-message timestamps and should not be affected
- `conversationReducer` must remain pure (no `Date.now()` side effects in the reducer itself — but the reducer is called from harness code that can pass `createdAt` as part of the event)
- No backend changes — timestamps are captured client-side

## Goals / Non-Goals

**Goals:**
- Add an optional `createdAt?: number` (epoch ms) field to `UIMessage`
- Record `Date.now()` when messages are created (user messages, assistant messages)
- Extract timestamps from historical messages when available (from backend `ready` event)
- Display `createdAt` as a formatted time string (`toLocaleTimeString()`) in the Web UI meta line
- Gracefully omit the time portion when `createdAt` is absent (legacy history)

**Non-Goals:**
- TUI timestamp display — TUI does not show per-message times
- Backend changes — no modification to how the server stores or transmits timestamps
- Timezone-aware formatting — use browser's default `toLocaleTimeString()` without custom locale logic
- Relative timestamps ("2 minutes ago") — keep it simple with absolute time

## Decisions

### Decision 1: `createdAt` as optional `number` (epoch ms)

**Choice:** Add `createdAt?: number` to `UIMessage` interface.

**Rationale:** Optional means zero migration cost — existing code that doesn't read `createdAt` is unaffected. `number` stores epoch milliseconds, consistent with `Date.now()` and JavaScript conventions. Using epoch ms avoids serialization ambiguity and is directly compatible with `new Date(createdAt).toLocaleTimeString()`.

**Alternatives considered:**
- `createdAt?: Date` — rejected because `Date` objects don't serialize cleanly across the wire protocol; the reducer would need to reconstruct them
- `createdAt: number` (required) — rejected because historical messages from `ready` may not have timestamps, and we don't want to fabricate values
- `timestamp?: string` (ISO 8601) — rejected because it adds parsing overhead and is less ergonomic for `Date.now()` assignment

### Decision 2: Timestamp assigned at the harness level, not inside the pure reducer

**Choice:** The `conversationReducer` remains pure. Timestamps are injected into events before the reducer is called. Specifically:
- `user_message` events carry an optional `createdAt` that the harness sets to `Date.now()` before dispatching
- `updateLastOrCreate` accepts an optional `createdAt` parameter provided by the harness

**Rationale:** The reducer is documented as pure and side-effect-free. Calling `Date.now()` inside it would violate that contract. The harness (which orchestrates event dispatch) is responsible for capturing wall-clock time.

**Alternatives considered:**
- `Date.now()` directly in the reducer — rejected because it breaks purity and makes testing harder
- Using the `id` field (already contains `Date.now()`) as the timestamp source — rejected because `id` is an implementation detail, not a semantic timestamp, and historical messages have synthetic IDs like `hist-0`

### Decision 3: Extract timestamp from `ready` event messages when available

**Choice:** In the `ready` case, check if each historical `ConversationMessage` has a `createdAt` field (number) and propagate it to `UIMessage.createdAt`. If absent, leave `createdAt` undefined.

**Rationale:** Some backends may include per-message timestamps. Using them when available makes history display accurate. When absent, the time portion is simply omitted — better than showing wrong times.

### Decision 4: `toLocaleTimeString()` for display formatting

**Choice:** Use `new Date(createdAt).toLocaleTimeString()` in `UserBubble` and `AssistantMessage`.

**Rationale:** This produces a locale-appropriate short time format (e.g., "2:34 PM" in en-US, "14:34" in de-DE) without any custom formatting logic. The browser handles it natively.

**Alternatives considered:**
- Custom formatting with `getHours()/getMinutes()` — rejected as unnecessary complexity when `toLocaleTimeString()` already exists
- `toLocaleString()` — rejected because it includes the date, which is too verbose for a message meta line

### Decision 5: Omit time when `createdAt` is absent

**Choice:** When `createdAt` is `undefined`, show only `"You"` / `"dscode"` without the time separator and time string.

**Rationale:** Showing no time is honest. Showing a fabricated time (like the current `"09:41"`) is misleading. The meta line remains functional as a role label.

## Risks / Trade-offs

- **Risk:** Client-side `Date.now()` may drift from server time → **Mitigation:** The discrepancy is typically sub-second and invisible in a message display context. This is the standard approach for chat UIs.
- **Risk:** `toLocaleTimeString()` output varies by browser locale, which may look inconsistent in screenshots → **Mitigation:** This is expected behavior; users see times in their own locale. If consistency is needed later, a `locales` option can be added.
- **Risk:** Historical messages without `createdAt` show no time, creating visual inconsistency with new messages that have times → **Mitigation:** This is acceptable — the alternative (showing wrong times) is worse. Over time, all messages will have timestamps as old history scrolls out.

## Migration Plan

1. Add `createdAt?: number` to `UIMessage` — no breaking change
2. Update reducer to propagate `createdAt` — existing behavior preserved when absent
3. Update `UserBubble` and `AssistantMessage` to conditionally render time — backward compatible
4. No data migration needed — `createdAt` is optional and populated at runtime
5. Rollback: revert to hardcoded string — no data to clean up

## Open Questions

_(none)_
