## 1. Directory and constraint file

- [x] 1.1 Create `docs/prototypes/` directory (if not exists)
- [x] 1.2 Create `docs/prototypes/prototype.md` constraint file with: output directory, naming convention, format requirements, style alignment rules, required skill (`html-output`), and lifecycle policy

## 2. Migrate existing prototype

- [x] 2.1 Move `mcp-toolcard-execution-view-prototype.html` from project root to `docs/prototypes/archive/2026-07-14-fix-explore-prototype-html/mcp-toolcard-execution-view-prototype.html`
- [x] 2.2 Verify the HTML file loads correctly from the new location in a browser

## 3. Update explore command files

- [x] 3.1 Add "Create HTML prototypes for frontend ideas" section under "What You Might Do" in `.claude/commands/opsx/explore.md`
- [x] 3.2 Mirror the same section in `.clinerules/workflows/opsx-explore.md`
- [x] 3.3 Section MUST include: detection keywords, trigger phrase ("要不要出一个 HTML 原型？"), generation steps (read constraint → load html-output skill → extract CSS variables → generate HTML), iteration flow, and reference to session 00MRIZMZQJ

## 4. Update System Prompt

- [x] 4.1 In AGENTS.md / System Prompt, replace the old "Create prototypes for frontend ideas" paragraph (which references `prototype.md` and `openspec instructions prototype`)
- [x] 4.2 New paragraph MUST describe HTML-first prototyping, reference `docs/prototypes/` and `docs/prototypes/prototype.md`, mention `html-output` skill, and cite session 00MRIZMZQJ

## 5. Update OpenSpec config

- [x] 5.1 In `openspec/config.yaml`, update the prototype artifact description to reference HTML prototypes, `docs/prototypes/`, and `html-output` skill — removing references to `prototype.md` as output and `openspec instructions prototype` CLI command
- [x] 5.2 Verify `openspec list --json` still works after config change
