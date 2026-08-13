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

3. **Finalize prototype lifecycle**

   For `spec-driven-plus`, read `<changeRoot>/prototype.md`.

   - If it is a non-UI stub, continue.
   - If any retention decision is missing or `pending`, load
     `prototype-workflow` and decide `archive` or `delete` for every HTML file.
   - Delete `delete` files and stale references.
   - Move `archive` files to
     `docs/prototypes/archive/YYYY-MM-DD-<change-name>/`.
   - Update all repository references and remove old
     `docs/prototypes/README.md` entries.
   - Verify the staging paths are absent and repository search finds no old
     references. Stop on archive-path conflicts rather than overwriting.

4. **Archive**

   Run `npx openspec archive <name> --yes`. This single command handles:
   - Artifact completion check (proposal, specs, tasks)
   - Task completion check
   - Delta spec sync
   - File move to archive

   If it fails, fix the reported errors and re-run.

5. **Report**

   Include the archived change path, spec sync result, and the archived/deleted
   prototype paths (or `not applicable`).

**Guardrails**
- Steps 2 and 3 are the required pre-archive operations.
  `npx openspec archive` handles artifact checks, spec sync, and moving the change.
- Step 3 is the mandatory prototype lifecycle gate for `spec-driven-plus`.
- NEVER skip step 2 for spec-driven-plus schemas.
- Never manually move directories — always use `npx openspec archive --yes`.
- Never leave completed-change prototypes in the `docs/prototypes/` staging root.
