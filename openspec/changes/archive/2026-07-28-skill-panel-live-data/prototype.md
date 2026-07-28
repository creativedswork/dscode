## Prototype

Reference: `docs/prototypes/skill-panel-live-data-active-inactive.html`

The prototype shows a side-by-side comparison of the Skills panel:

- **Left**: Current hardcoded mock — "Installed"/"Available" sections with non-functional "Install" button
- **Right**: Target design — "Active"/"Inactive" sections driven by live data, with toggle switches to activate/deactivate

### Key visual decisions

| Element | Before | After |
|---------|--------|-------|
| Grouping | Installed / Available (mock) | Active / Inactive (live) |
| Card action | "Install" button (non-functional) | Toggle switch (activate/deactivate) |
| Card metadata | Tags like "game", "canvas" | Tags like "12 tools", "user"/"project" |
| Badge | Hardcoded "5" | Dynamic active count |
| Inactive cards | N/A | Reduced opacity (0.65) + off toggle |
| Marketplace | Dashed banner (unchanged) | Dashed banner (unchanged) |
