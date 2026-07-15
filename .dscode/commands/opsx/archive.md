---
name: "OPSX: Archive"
description: Archive a completed change in the experimental workflow
category: Workflow
tags: [workflow, archive, experimental]
---

Archive a completed change in the experimental workflow.

**Store selection:** If the user names a store, run `npx openspec store list --json` to discover registered store ids, then pass `--store <id>` on commands that read or write specs and changes. Without a store, commands act on the nearest local `openspec/` root.

**Input**: Optionally specify a change name after `/opsx:archive` (e.g., `/opsx:archive add-auth`). If omitted, prompt for selection.

**Steps**

1. **Select change** (if not provided)

   Run `npx openspec list --json`. Show active changes (not archived). Let user choose. Do NOT auto-select.

2. **Generate consolidate** (MANDATORY for spec-driven-plus schemas)

   Run `npx openspec status --change "<name>" --json`. Check `artifactPaths` for a `consolidate` artifact.

   **If consolidate artifact exists:**
   - This step is MANDATORY. Do NOT skip it.
   - Run `npx openspec instructions consolidate --change "<name>" --json`
   - Scan `openspec/changes/archive/` for related changes (match by capability keywords, file paths, topic)
   - Read current proposal.md + related archived proposals
   - Write consolidate.md using the returned template (overwrite if exists)
   - Show: "Merged N related changes, timeline from YYYY-MM-DD to YYYY-MM-DD"

   **If no consolidate artifact:** Skip to step 3.

3. **Archive**

   Run `npx openspec archive <name> --yes`. This single command handles:
   - Artifact completion check (proposal, specs, tasks)
   - Task completion check
   - Delta spec sync
   - File move to archive

   If it fails, fix the reported errors and re-run.

**Guardrails**
- Step 2 (consolidate) is the ONLY step you control. `npx openspec archive` handles everything else.
- NEVER skip step 2 for spec-driven-plus schemas.
- Never manually move directories — always use `npx openspec archive --yes`.
