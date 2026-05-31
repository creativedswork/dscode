## Why

In the Web UI, typing `/session load <id>` crashes with `ctx.tui.replayMessages is not a function`. The web backend's `mockTui` object passed to slash commands is missing the `replayMessages` method that the session load command handler in `commands.ts` calls after loading a session. The sidebar-based session load works correctly because it uses a separate dedicated handler (`handleSession`) that properly sends structured WebSocket events; the slash command path should behave equivalently.

## What Changes

- Add `replayMessages` to the `mockTui` object in `handleSlashCommand` within `web-backend.ts`, implementing it to clear the conversation view, rebuild conversation history, and send a `ready` event — matching the behavior of the sidebar's `handleSession` "load" path.

## Capabilities

### New Capabilities

- `web-session-load-slash`: The Web UI's slash command `/session load <id>` loads a session and correctly displays the restored messages in the conversation view, matching the sidebar session load behavior.

### Modified Capabilities

None — this is a bug fix; no existing spec requirements change.

## Impact

- `src/ui/web/web-backend.ts`: Add `replayMessages` method to `mockTui`, plus a helper to rebuild and send conversation history (mirroring what `handleSession` does).
