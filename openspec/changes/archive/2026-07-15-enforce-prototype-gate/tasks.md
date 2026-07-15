## 1. Schema hard gate

- [x] 1.1 In `openspec/schemas/spec-driven-plus/schema.yaml`: change `prototype.requires` from `[]` to `[design]`
- [x] 1.2 In `openspec/schemas/spec-driven-plus/schema.yaml`: change `tasks.requires` from `[specs, design]` to `[specs, design, prototype]`
- [x] 1.3 In `openspec/schemas/spec-driven-plus/schema.yaml`: update prototype artifact description — remove "optional" and "does not block apply", state it is mandatory and blocks tasks
- [x] 1.4 In `openspec/schemas/spec-driven-plus/schema.yaml`: rewrite prototype artifact instruction — reference HTML prototypes from `docs/prototypes/` for UI changes; describe non-UI stub format; remove "Do NOT write HTML/CSS code" (HTML is written during explore, not propose)

## 2. Prototype template restructure

- [x] 2.1 Rewrite `openspec/schemas/spec-driven-plus/templates/prototype.md` as a prototype manifest with two sections: (a) "Prototype Files" listing HTML paths from `docs/prototypes/` with design decision summaries for UI changes, (b) "Prototype Status" stub for non-UI changes

## 3. Config alignment

- [x] 3.1 In `openspec/config.yaml`: remove "Prototype does NOT block apply" from the prototype description
- [x] 3.2 In `openspec/config.yaml`: update prototype description to state it is mandatory and blocks tasks creation

## 4. Explore command — unconditional propose flow

- [x] 4.1 In `.dscode/commands/opsx/explore.md`: rewrite "Ending Discovery" section — explore ALWAYS directs to `/opsx:propose`, never `/opsx:apply`; if prototype was created, mention it will be incorporated in propose
- [x] 4.2 Copy updated explore.md to `.clinerules/workflows/opsx-explore.md`
- [x] 4.3 Copy updated explore.md to `.claude/commands/opsx/explore.md`

## 5. Propose command — prototype awareness

- [x] 5.1 In `.dscode/commands/opsx/propose.md`: add step 0 before "Create the change directory" — check `docs/prototypes/` for HTML files matching the change name; if found, read them as design source-of-truth; if not found and change is UI, offer to generate prototype first; if not found and non-UI, proceed with stub
- [x] 5.2 Copy updated propose.md to `.clinerules/workflows/opsx-propose.md`
- [x] 5.3 Copy updated propose.md to `.claude/commands/opsx/propose.md`

## 6. Skill updates

- [x] 6.1 In `.dscode/skills/prototype-workflow/SKILL.md`: update step 6 from "capture into design.md / specs" to "guide user to run /opsx:propose — the prototype will be incorporated into the change's prototype artifact"
- [x] 6.2 In `.dscode/skills/openspec-explore/SKILL.md`: update ending to unconditionally direct to `/opsx:propose`
- [x] 6.3 In `.dscode/skills/openspec-propose/SKILL.md`: add prototype awareness — check `docs/prototypes/` before creating prototype artifact

## 7. Retroactive stubs for in-flight changes

- [x] 7.1 Add prototype.md stub to `openspec/changes/fix-tool-result-rendering/` (non-UI stub)
- [x] 7.2 Add prototype.md stub to `openspec/changes/subagent-design-proposal/` (non-UI stub)

## 8. Verification

- [x] 8.1 Run `openspec status --change enforce-prototype-gate` and verify all artifacts are done
- [x] 8.2 Run `openspec status --change fix-tool-result-rendering` and verify tasks is no longer blocked by missing prototype
- [x] 8.3 Run `npm run typecheck` to ensure no code changes broke compilation
