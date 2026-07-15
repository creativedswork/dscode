## Why

The Web UI displays a hardcoded time string `"09:41"` on every chat message meta line (`You · 09:41` / `dscode · 09:41`). The time never changes regardless of when the message was actually sent, making it misleading and useless. The root cause is twofold: the `UIMessage` type has no timestamp field, and the `ChatView` component hardcodes the time string instead of formatting a real value.

## What Changes

- Add an optional `createdAt?: number` field to the `UIMessage` interface in `src/ui/shared/types.ts`
- Record `Date.now()` as `createdAt` when the conversation reducer creates a new user message (`user_message` event) or a new assistant message (`updateLastOrCreate`)
- Attempt to extract `createdAt` from historical messages in the `ready` event mapping (if the backend provides a timestamp); fall back gracefully if absent
- Replace the hardcoded `"09:41"` string in `UserBubble` and `AssistantMessage` in `web/src/components/ChatView.tsx` with a `toLocaleTimeString()`-formatted value derived from `message.createdAt`
- When `createdAt` is absent (e.g. legacy history messages without timestamps), omit the time portion from the meta line rather than showing a wrong value

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `shared-conversation-model`: Add `createdAt` field to `UIMessage` type and record it at creation time in the reducer
- `web-frontend`: Display real per-message timestamps in the chat meta line instead of hardcoded string; gracefully omit time when timestamp is unavailable

## Impact

- **`src/ui/shared/types.ts`** — `UIMessage` interface gains `createdAt?: number`
- **`src/ui/shared/reducer.ts`** — `user_message` case and `updateLastOrCreate` set `createdAt: Date.now()`; `ready` case attempts to read timestamp from historical message data
- **`web/src/components/ChatView.tsx`** — `UserBubble` and `AssistantMessage` format `message.createdAt` via `toLocaleTimeString()` instead of hardcoded `"09:41"`
- **No breaking changes** — `createdAt` is optional; existing code that doesn't read it is unaffected. The TUI does not display per-message timestamps and is not touched.
- **No backend changes required** — timestamps are captured client-side at message creation. If the backend's `ready` event already includes per-message timestamps, they will be used; otherwise the field is simply absent for history.
