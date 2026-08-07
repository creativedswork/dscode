---
name: openspec-archive-change
description: Archive a completed change in the experimental workflow. Use when the user wants to finalize and archive a change after implementation is complete.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.3.1"
---

# Archive OpenSpec Change

Archive a completed change in the experimental workflow.

**Input**: Optionally specify a change name. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **If no change name provided, prompt for selection**

   Run `openspec list --json` to get available changes. Use the **AskUserQuestion tool** to let the user select.

   Show only active changes (not already archived).
   Include the schema used for each change if available.

   **IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

2. **Check artifact completion status**

   Run `openspec status --change "<name>" --json` to check artifact completion.

   Parse the JSON to understand:
   - `schemaName`: The workflow being used
   - `artifacts`: List of artifacts with their status (`done` or other)

   **If any artifacts are not `done`:**
   - Display warning listing incomplete artifacts
   - Use **AskUserQuestion tool** to confirm user wants to proceed
   - Proceed if user confirms

3. **Check task completion status**

   Read the tasks file (typically `tasks.md`) to check for incomplete tasks.

   Count tasks marked with `- [ ]` (incomplete) vs `- [x]` (complete).

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Use **AskUserQuestion tool** to confirm user wants to proceed
   - Proceed if user confirms

   **If no tasks file exists:** Proceed without task-related warning.

4. **Assess delta spec sync state**

   Check for delta specs at `openspec/changes/<name>/specs/`. If none exist, proceed without sync prompt.

   **If delta specs exist:**
   - Compare each delta spec with its corresponding main spec at `openspec/specs/<capability>/spec.md`
   - Determine what changes would be applied (adds, modifications, removals, renames)
   - Show a combined summary before prompting

   **Prompt options:**
   - If changes needed: "Sync now (recommended)", "Archive without syncing"
   - If already synced: "Archive now", "Sync anyway", "Cancel"

   If user chooses sync, use Task tool (subagent_type: "general-purpose", prompt: "Use Skill tool to invoke openspec-sync-specs for change '<name>'. Delta spec analysis: <include the analyzed delta spec summary>"). Proceed to archive regardless of choice.

4.5 **If schema is `spec-driven-plus`, ensure consolidate is done**

   If the schema is `spec-driven-plus`, check if `consolidate.md` exists in the change directory.
   If not, generate it before proceeding:
   ```bash
   openspec instructions consolidate --change "<name>" --json
   ```
   Read the consolidate template, scan related archived changes, and create `consolidate.md`.

   **Skip if:**
   - Schema is not `spec-driven-plus`
   - consolidate.md already exists

5. **Finalize prototype lifecycle**

   For `spec-driven-plus`, read `<changeRoot>/prototype.md`.

   - If it is a non-UI stub, continue.
   - If the `## Prototype Retention` table is missing, incomplete, or still
     contains `pending`, load `prototype-workflow` and make the final
     per-file `archive` or `delete` decision before proceeding.
   - For `delete`, remove any remaining staging HTML, remove its
     `docs/prototypes/README.md` entry, and remove or rewrite stale references.
   - For `archive`, create
     `docs/prototypes/archive/YYYY-MM-DD-<change-name>/`, move the HTML there,
     update `prototype.md`, `design.md`, specs, docs, and all other repository
     references from the staging path to the archived path, and remove the old
     README entry.
   - Do not overwrite an existing archive file. Stop and resolve the conflict.
   - Verify no current-change HTML remains directly under `docs/prototypes/`
     and a repository search finds no references to its old staging path.

   This step is mandatory even when apply was skipped or completed before the
   lifecycle policy existed.

6. **Perform the archive**

   Create the archive directory if it doesn't exist:
   ```bash
   mkdir -p openspec/changes/archive
   ```

   Generate target name using current date: `YYYY-MM-DD-<change-name>`

   **Check if target already exists:**
   - If yes: Fail with error, suggest renaming existing archive or using different date
   - If no: Move the change directory to archive

   ```bash
   mv openspec/changes/<name> openspec/changes/archive/YYYY-MM-DD-<name>
   ```

7. **Display summary**

   Show archive completion summary including:
   - Change name
   - Schema that was used
   - Archive location
   - Whether specs were synced (if applicable)
   - Note about any warnings (incomplete artifacts/tasks)

**Output On Success**

```
## Archive Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Archived to:** openspec/changes/archive/YYYY-MM-DD-<name>/
**Specs:** ✓ Synced to main specs (or "No delta specs" or "Sync skipped")
**Prototypes:** <archived paths, deleted paths, or not applicable>

All artifacts complete. All tasks complete.
```

**Guardrails**
- Always prompt for change selection if not provided
- Use artifact graph (openspec status --json) for completion checking
- Don't block archive on warnings - just inform and confirm
- Preserve .openspec.yaml when moving to archive (it moves with the directory)
- Show clear summary of what happened
- If sync is requested, use openspec-sync-specs approach (agent-driven)
- If delta specs exist, always run the sync assessment and show the combined summary before prompting
- Never leave completed-change prototypes in the `docs/prototypes/` staging root
- Never archive a prototype without updating all references to its final path
