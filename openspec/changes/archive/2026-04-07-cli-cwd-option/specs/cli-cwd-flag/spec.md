## ADDED Requirements

### Requirement: CLI --cwd flag sets startup working directory
The CLI entry point in `src/core/main.ts` SHALL accept a `--cwd <path>` option. When provided, the resolved absolute path SHALL be used as the startup working directory (`startupPath` / `projectPath`), taking precedence over the `DSCODE_PROJECT_PATH` environment variable and `process.cwd()`.

#### Scenario: --cwd with valid absolute path
- **WHEN** dscode is invoked as `dscode --cwd /home/user/myproject`
- **THEN** `startupPath` SHALL be `/home/user/myproject`
- **AND** `process.chdir("/home/user/myproject")` SHALL be called during `loadConfig()`

#### Scenario: --cwd with relative path
- **WHEN** dscode is invoked as `dscode --cwd ./myproject`
- **THEN** `startupPath` SHALL be `path.resolve(process.cwd(), "./myproject")`

#### Scenario: --cwd takes precedence over DSCODE_PROJECT_PATH
- **WHEN** dscode is invoked as `DSCODE_PROJECT_PATH=/other dscode --cwd /home/user/myproject`
- **THEN** `startupPath` SHALL be `/home/user/myproject` (CLI flag wins)

#### Scenario: --cwd composes with --debug
- **WHEN** dscode is invoked as `dscode --cwd /home/user/myproject --debug`
- **THEN** both the `--cwd` path SHALL be applied AND debug mode SHALL be enabled

#### Scenario: --cwd composes with --web
- **WHEN** dscode is invoked as `dscode --cwd /home/user/myproject --web --web-port 8080`
- **THEN** the working directory SHALL be `/home/user/myproject` AND the web server SHALL start on port 8080

#### Scenario: No --cwd flag (backward compatible)
- **WHEN** dscode is invoked without `--cwd`
- **THEN** behavior SHALL be unchanged: `startupPath` resolves from `DSCODE_PROJECT_PATH` or `process.cwd()` as before

### Requirement: loadConfig accepts optional cliCwd parameter
The `loadConfig()` function in `src/core/config.ts` SHALL accept an optional `cliCwd?: string` parameter. When `cliCwd` is provided and non-empty, it SHALL be resolved and used as `startupPath` instead of the `DSCODE_PROJECT_PATH` / `process.cwd()` fallback chain.

#### Scenario: cliCwd provided
- **WHEN** `loadConfig({ cliCwd: "/home/user/myproject" })` is called
- **THEN** `startupPath` SHALL be the resolved absolute path of `/home/user/myproject`
- **AND** `projectPath` SHALL equal `startupPath`

#### Scenario: cliCwd omitted or undefined
- **WHEN** `loadConfig()` is called without `cliCwd` or with `cliCwd: undefined`
- **THEN** behavior SHALL be identical to the current implementation (uses `DSCODE_PROJECT_PATH` or `process.cwd()`)
