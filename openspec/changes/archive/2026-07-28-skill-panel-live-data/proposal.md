## Why

The Skills panel in the web UI renders hardcoded mock data that has no connection to the backend skill system. Skills discovered and activated by `SkillManager` are invisible to the UI, while the panel fabricates an "Installed vs Available" classification with a non-functional "Install" button that has no real-world meaning — skills in this system are file-driven, not downloaded.

## What Changes

- **Replace hardcoded skill lists** with data fetched from `SkillManager.listAll()` via API
- **Change grouping** from "Installed / Available" to "Active / Inactive" — the only meaningful dimension in a file-driven skill system
- **Remove the "Install" button** — installing a skill currently has no backend mechanism; the concept does not apply
- **Add a toggle** to activate/deactivate skills (the backend already supports this via `/skills activate|deactivate`)
- **Remove `installedSkillCount = 5` placeholder** in the sidebar badge; derive from backend
- **Keep the Marketplace banner** as a placeholder for future integration

## Capabilities

### Modified Capabilities

- `skill-management-ui`: Redefine the panel's data source, grouping model, and available actions. Replace the mock "Installed/Available" concept with live "Active/Inactive" driven by `SkillManager`. Remove the Install action; add activate/deactivate toggle. Update spec scenarios accordingly.

## Impact

- `web/src/components/Sidebar.tsx` — `DetailSkillsPanel` component: replace hardcoded arrays with API-driven state, change card structure
- `src/ui/web/web-backend.ts` — add `GET /api/skills` and `POST /api/skills/:name/toggle` endpoints (if not already present)
- `openspec/specs/skill-management-ui/spec.md` — rewrite requirements to match the new data model
