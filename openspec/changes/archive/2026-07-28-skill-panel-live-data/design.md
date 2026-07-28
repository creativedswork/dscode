## Context

The `SkillManager` (in `src/skills/manager.ts`) maintains two maps:
- `manifests`: all discovered skills (from `~/.dscode/skills/` and `.dscode/skills/`)
- `activeSkills`: subset that have been activated

At startup, `harness.initialize()` auto-activates every discovered skill. The backend CLUI already supports `/skills activate|deactivate` commands, exposing `SkillManager.activate()` and `SkillManager.deactivate()`.

However, the web frontend's `DetailSkillsPanel` is a static mock — two hardcoded arrays with fabricated "Installed/Available" classification and a non-functional "Install" button. The frontend has no access to real skill data.

The communication layer between frontend and backend is WebSocket-based, using typed `ServerEvent` / `ClientCommand` messages defined in `src/ui/shared/types.ts`. This is the natural channel for skill data.

## Goals / Non-Goals

**Goals:**
- `DetailSkillsPanel` shows real skill data from `SkillManager.listAll()`
- Users can activate/deactivate skills via toggle in the UI
- Sidebar badge count reflects actual active skill count
- Remove the misleading "Install" button and "Installed/Available" grouping
- Group by "Active" / "Inactive" — the only meaningful dimension today

**Non-Goals:**
- Implementing a marketplace backend or remote skill discovery
- Changing the `SkillManager` activation model or file-based discovery
- Adding skill search, filtering, or sorting (can come later)
- Modifying the CLUI `/skills` command behavior

## Decisions

### Decision 1: Push skill state via WebSocket (like `mcp_state`)

**Chosen**: Add `skill_state` ServerEvent and `skill` ClientCommand to the existing WebSocket protocol.

**Alternatives considered**:
- REST endpoints (`GET /api/skills`, `POST /api/skills/:name/toggle`) — adds a second communication channel for no benefit. The app already has a live WebSocket for real-time state.
- Polling — wasteful, breaks the existing pattern.

**Rationale**: MCP servers already follow this exact pattern (`mcp_state` ServerEvent + `mcp` ClientCommand). Skills should mirror it.

### Decision 2: Data shape — `SkillInfo`

```typescript
interface SkillInfo {
  name: string;
  description: string;
  active: boolean;
  source: "user" | "project";
  toolsCount: number;
}
```

This is a subset of `Skill`/`SkillManifest` — enough for the UI panel without leaking tool lists or raw instructions. `toolsCount` gives a quick capability indicator without overwhelming the card.

### Decision 3: Group by Active/Inactive (not Installed/Available)

**Chosen**: Two sections — "Active" and "Inactive".

**Why not "Installed/Available"**: In the current file-driven model, "installed" effectively means "the SKILL.md exists on disk." There is no marketplace or remote source, so "available but not installed" has no real meaning. Active/Inactive maps directly to `SkillManager.activeSkills.has(name)` and is actionable via `activate()`/`deactivate()`.

### Decision 4: Toggle button per skill card

**Chosen**: Each skill card shows a toggle (like MCP servers use) to activate/deactivate.

**Why not "Activate"/"Deactivate" text buttons**: The MCP panel already established a visual toggle pattern (pill-shaped slider). Consistency wins. But the skill behavior is simpler than MCP — no connection lifecycle, just a boolean flip — so a simpler compact toggle works.

### Decision 5: Sidebar badge = active count

**Chosen**: The sidebar "Skills" nav item badge shows `activeSkillCount`, replacing `installedSkillCount = 5`.

This aligns with what users care about: how many skills are currently loaded and affecting the agent's behavior.

## Data Flow

```
Frontend                         Backend
───────                         ───────
connect ──────────────────────────────▶  pushSkillState(client)
                                       │  SkillManager.listAll()
                                       │  → build SkillInfo[]
                                       │
◀──────── { type: "skill_state", 
            skills: SkillInfo[] } ─────

user clicks toggle ───────────────▶  handleSkill(client, cmd)
  { type: "skill",
    action: "toggle",
    name: "web-game-design" }         SkillManager.activate/deactivate()
                                       pushSkillState(client) // broadcast update

◀──────── { type: "skill_state",
            skills: SkillInfo[] } ─────
```

## Risks / Trade-offs

- **Toggle persistence**: `SkillManager` state lives in memory. If the server restarts, all discovered skills auto-activate again (current behavior). If a user deactivates a skill, it only lasts until restart. → Acceptable for now; this matches the existing CLUI behavior. Persistent skill preference can be added later via `settings.json`.
- **Tools change on toggle**: Activating/deactivating a skill changes the agent's available tools mid-session. The next turn will use the updated tool set. This is the same behavior as the CLUI `/skills activate|deactivate` commands.
