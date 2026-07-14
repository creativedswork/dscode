## 1. Core data structures

- [x] 1.1 Add `CommandManifest` interface to `src/core/types.ts` (name, description, body, source, path)

## 2. Command file loader

- [x] 2.1 Update `src/commands/loader.ts` — `scanCommandDirs(userDir, projectDir)` function now recursively scans directories; command name derived from relative path (e.g. `opsx/apply.md` → `opsx:apply`); project overrides user on name conflict
- [x] 2.2 Make `name` field in frontmatter optional — if present it must match path-derived name (sanity check), skip with warning on mismatch; if absent, use path-derived name
- [x] 2.3 Reuse `parseSkillManifest`'s frontmatter parsing pattern for `description` field; body is everything after `---`

## 3. Command manager

- [x] 3.1 Create `src/commands/manager.ts` — `CommandManager` class that holds manifests, provides `getSystemPromptSection()` (returns `# Commands` section listing name+description; empty string if no commands)

## 4. Config integration

- [x] 4.1 Add `userCommandsDir` and `projectCommandsDir` to `HarnessConfig` in `src/core/types.ts`
- [x] 4.2 Compute and pass `userCommandsDir` / `projectCommandsDir` in `src/core/config.ts` (`loadConfig` function)

## 5. Harness integration

- [x] 5.1 Instantiate `CommandManager` in `src/core/harness.ts` constructor, store as `commandManager`
- [x] 5.2 Call `commandManager.getSystemPromptSection()` in `buildSystemPrompt()` and append it after the Skills section

## 6. Slash command integration

- [x] 6.1 Add `commandManager: CommandManager` to `SlashCommandContext` in `src/ui/commands.ts`
- [x] 6.2 Update `getSlashCommandAutocomplete(customCommands?: CommandManifest[])` to accept and prepend custom commands to the built-in list
- [x] 6.3 Update `executeSlashCommand()` to check custom commands first (via `$input` replacement), fall through to built-in; built-in takes priority on name conflict

## 7. TUI / Web wiring

- [x] 7.1 In `src/ui/tui-app.ts`, pass custom commands from `deps.commandManager` to `getSlashCommandAutocomplete()` and into `SlashCommandContext`
- [x] 7.2 In `src/ui/web/web-backend.ts`, pass custom commands to autocomplete and execution context
- [x] 7.3 In `src/ui/tui-backend.ts`, wire commandManager into SlashCommandContext for TUI mode

## 8. Example commands


## 9. Subdirectory support

- [x] 9.1 Update `scanDir` to recursively walk subdirectories instead of only scanning top-level `.md` files
- [x] 9.2 Derive command name from relative path: split by `/`, join with `:` (e.g. `opsx/apply.md` → `opsx:apply`, `a/b/c.md` → `a:b:c`)
- [x] 9.3 Make frontmatter `name` optional — use path-derived name when `name` is absent; when `name` is present, validate it matches path-derived name, skip with warning if mismatch
- [x] 9.4 Update `system-prompt-structure` spec: command listing uses `:`-separated names for subdirectory commands
- [x] 9.5 Create example subdirectory commands: `.dscode/commands/opsx/` with `apply.md`, `archive.md`, `explore.md`, `propose.md`
- [x] 8.1 Create `.dscode/commands/code-review.md` as a demo example command
