## Why

Currently the working directory (`cwd`) can only be set via the `DSCODE_PROJECT_PATH` environment variable or by running dscode from the target directory. There is no CLI flag to override it. This makes it awkward to combine with other CLI flags like `--debug` — you'd have to `cd` first and then run dscode, or set an env var alongside the flags. Adding `--cwd <path>` gives users a clean, composable CLI experience.

## What Changes

- **Add `--cwd <path>` CLI flag** to `parseArgs()` in `src/core/main.ts`, parsed alongside existing flags (`--web`, `--debug`, `--web-port`).
- **Pass cwd from CLI args to `loadConfig()`** so it takes precedence over `DSCODE_PROJECT_PATH` and `process.cwd()`.
- The runtime behavior (`/config cwd` in TUI, `set_project_path` in Web) is unaffected — this is purely a startup-time override.

## Capabilities

### New Capabilities

- `cli-cwd-flag`: CLI `--cwd <path>` option that sets the startup working directory, composable with all other CLI flags.

### Modified Capabilities

<!-- No existing spec requirement changes — the shared config spec already says projectPath defaults to process.cwd() and can be changed at runtime. This adds a CLI override at startup without changing any existing contract. -->

## Impact

- **`src/core/main.ts`**: `parseArgs()` gains a `--cwd` parser; the resolved path is threaded through to `loadConfig()`.
- **`src/core/config.ts`**: `loadConfig()` accepts an optional `cliCwd` parameter that, when provided, overrides `DSCODE_PROJECT_PATH` and `process.cwd()`.
