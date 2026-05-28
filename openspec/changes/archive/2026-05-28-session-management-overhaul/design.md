## Context

Sessions are currently stored as flat JSON files in `~/.dscode/data/sessions/` (via `SessionStore`) with an `index.json` for listing. There is no project awareness — all sessions across all projects share one namespace. The `SessionMetadata` type has no `projectPath` field.

Error handling is minimal: the store catches exceptions and silently returns null/false. There's no validation of loaded data structure. The atomic write (write-tmp-then-rename) has a direct-write fallback that could mask filesystem issues.

The `/session list` command displays only `id[:8]`, `title`, `date`, and `messageCount`. The `/session load` command only echoes `Loaded session: {title}`. The web backend sends similarly sparse `SessionInfo`.

## Goals / Non-Goals

**Goals:**
- Partition sessions by project directory so users working in different repos see separate session lists
- Backward-compatible: existing global sessions remain accessible (displayed when no project filter applies or via a `--all` flag)
- Validate session file integrity on load, reject corrupted files with clear errors
- Enrich session display to include model info, project path, timestamps, and content preview
- Keep the same JSON file-per-session + index.json architecture

**Non-Goals:**
- Database-backed storage (staying with JSON files)
- Session export/import
- Session merging or diffing
- Cloud sync

## Decisions

### Decision 1: Project-scoped directory layout

Use a hash-based subdirectory under `sessions/` to avoid filesystem issues with path separators in directory names.

```
~/.dscode/data/sessions/
  index.json           ← global index (all sessions, for backward compat)
  by-project/
    <slug>/            ← slug = sanitized project path (e.g., "Users_alice_projects_myapp")
      index.json
      <id>.json
```

**Alternative considered**: Flat layout with `projectPath` in the filename. Rejected because it doesn't scale — a single directory with thousands of files across projects becomes slow to list.

**Alternative considered**: Encoding the full path in the directory name (e.g., `by-project/Users/alice/projects/myapp/`). Rejected because nested mkdir is fragile and path separators cause issues.

**Chosen**: Sanitize the absolute project path into a slug (replace `/` with `_`, strip leading `_`). Store sessions under `by-project/<slug>/`. Keep the global `index.json` for the `--all` view.

### Decision 2: Backward compatibility for existing sessions

On first run with the new code, existing sessions in `sessions/*.json` have no `projectPath` in metadata. These are treated as "unscoped" and appear in the global `--all` list but not in any project's list. Users can re-save them from a project context to adopt the new scoping.

No automatic migration — too risky to guess which project a session belongs to.

### Decision 3: Validation on load

`SessionStore.load()` SHALL validate:
1. File exists and is readable
2. Content is valid JSON
3. Has `version`, `metadata`, `messages` fields
4. `metadata` has `id`, `title`, `createdAt`, `updatedAt`
5. `metadata.id` matches the filename (prevent tampering)

Validation failures produce specific error messages surfaced through the UI, not silent null returns.

### Decision 4: Enhanced display format

**`/session list`** output:
```
Sessions (project: /Users/alice/projects/myapp):
  01a2b3c4  "Fix the login page bug"        deepseek/v3  2025-12-20  14:32  42 msgs
  05d6e7f8  "Add user authentication tests"  kimi-coding  2025-12-19  09:15  18 msgs
```

**`/session load <id>`** output:
```
Loaded session: 01a2b3c4
  Title:    "Fix the login page bug"
  Model:    deepseek / deepseek-chat
  Project:  /Users/alice/projects/myapp
  Created:  2025-12-18 10:00
  Activity: 2025-12-20 14:32
  Messages: 42
```

This gives users enough context to confirm they loaded the right session.

### Decision 5: Content preview in list

Extract the first user message text (first 80 chars) as a preview snippet. Store this in `SessionMetadata` as `preview` so it's available without loading the full session file. Compute it on save, not on list.

## Risks / Trade-offs

- **[Risk] Slug collisions**: Two different paths could produce the same slug. → **Mitigation**: Include a short hash suffix in the slug (first 8 chars of SHA256 of the path).
- **[Risk] Cross-project session portability**: Users can't easily move sessions between machines if project paths differ. → **Mitigation**: This is acceptable; sessions are tied to a project, not portable by design.
- **[Risk] index.json drift**: If a session file exists but index.json is missing the entry, the session becomes invisible in list. → **Mitigation**: Add a `repair` subcommand (future) or auto-rebuild index by scanning JSON files on list if index is missing.
