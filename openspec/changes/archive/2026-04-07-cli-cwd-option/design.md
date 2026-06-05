## Context

`src/core/main.ts` contains the CLI entry point with a `parseArgs()` function that handles `--web`, `--debug`, `--web-port`, `--version`/`-v`. The working directory is determined in `loadConfig()` via `process.env.DSCODE_PROJECT_PATH ?? process.cwd()` — with no way to set it from CLI flags.

The shared config spec already defines `projectPath` as defaulting to `process.cwd()` at startup, changeable at runtime via `/config cwd`. This design adds a CLI override at startup without touching that runtime contract.

## Goals / Non-Goals

**Goals:**
- Add `--cwd <path>` CLI flag that sets the startup working directory
- The flag composes correctly with all existing flags (`--web`, `--debug`, `--web-port`)
- The resolved path is absolute (via `path.resolve`)
- CLI `--cwd` takes highest startup precedence (above env var, above `process.cwd()`)
- No change to runtime cwd switching behavior

**Non-Goals:**
- No new config file fields or persisted settings
- No change to `loadConfig()` return type or `HarnessConfig` interface
- No change to Web or TUI backends
- No shorthand flag (only `--cwd`, no `-C`)

## Decisions

### Decision 1: Precedence — `--cwd` > `DSCODE_PROJECT_PATH` > `process.cwd()`

**Rationale**: CLI flags are the most explicit user intent, so they should win. The env var is less visible but still intentional. `process.cwd()` is the fallback.

**Alternative considered**: Placing `--cwd` below env var. Rejected because CLI args are the standard highest-precedence layer.

### Decision 2: Thread `cliCwd` through `parseArgs()` → `main()` → `loadConfig()`

Rather than setting `process.env.DSCODE_PROJECT_PATH` from the parsed flag (side-effect on global state), we pass a clean `cliCwd?: string` parameter through the call chain.

**Rationale**: Avoids mutating `process.env`, keeps the data flow explicit and testable. `loadConfig()` already has clear logic for resolving `startupPath`; adding an optional parameter is the minimal change.

**Alternative considered**: Setting `process.env.DSCODE_PROJECT_PATH = resolvedPath` in `parseArgs()`. Rejected because it's an implicit side effect and harder to trace.

### Decision 3: Only `--cwd`, no shorthand

Keeps the CLI surface minimal. Can add `-C` later if demand arises.

## Risks / Trade-offs

- **[Risk] Path doesn't exist**: If the user passes a non-existent path, `process.chdir()` in `loadConfig()` will throw. → **Mitigation**: `loadConfig()` already doesn't validate path existence before `chdir`; the error message from Node.js is descriptive enough (`ENOENT`).
- **[Risk] Relative path confusion**: User passes a relative path, it gets resolved against the original `process.cwd()`. This is standard Unix behavior and expected.
