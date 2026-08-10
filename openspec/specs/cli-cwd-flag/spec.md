# cli-cwd-flag Specification

## Purpose

Define explicit CLI workspace selection without mutating process-global cwd or
coupling Web asset resolution to the selected project.

## Requirements

### Requirement: CLI --cwd flag sets startup working directory
The CLI entry point in `src/bootstrap/cli-main.ts` SHALL accept a `--cwd <path>` option. When provided, the resolved absolute path SHALL be used as the startup working directory (`startupPath` / `projectPath`), taking precedence over the `DSCODE_PROJECT_PATH` environment variable and `process.cwd()`.

#### Scenario: --cwd with valid absolute path
- **WHEN** dscode is invoked as `dscode --cwd /home/user/myproject`
- **THEN** `startupPath` SHALL be `/home/user/myproject`
- **AND** the standard Agent Host SHALL use that path as its workspace
- **AND** process-global cwd SHALL remain unchanged

#### Scenario: --cwd with relative path
- **WHEN** dscode is invoked as `dscode --cwd ./myproject`
- **THEN** `startupPath` SHALL be resolved against the CLI process working directory captured at startup

#### Scenario: --cwd takes precedence over DSCODE_PROJECT_PATH
- **WHEN** dscode is invoked as `DSCODE_PROJECT_PATH=/other dscode --cwd /home/user/myproject`
- **THEN** `startupPath` SHALL be `/home/user/myproject` (CLI flag wins)

#### Scenario: --cwd composes with --debug
- **WHEN** dscode is invoked as `dscode --cwd /home/user/myproject --debug`
- **THEN** the Host workspace SHALL be `/home/user/myproject`
- **AND** debug mode SHALL be enabled

#### Scenario: --cwd composes with --web
- **WHEN** dscode is invoked as `dscode --cwd /home/user/myproject --web --web-port 8080`
- **THEN** the Host workspace SHALL be `/home/user/myproject`
- **AND** the Web server SHALL start on port 8080
- **AND** built SPA assets SHALL resolve independently of the Host workspace

#### Scenario: No --cwd flag (backward compatible)
- **WHEN** dscode is invoked without `--cwd`
- **THEN** `startupPath` SHALL resolve from the captured `DSCODE_PROJECT_PATH` or startup cwd

### Requirement: loadConfig accepts optional cliCwd parameter
The `loadConfig()` function in `src/config/loader.ts` SHALL accept an optional
`cliCwd` argument plus explicit environment and startup-cwd options. It MUST NOT
mutate `process.cwd()` or `process.env`.

#### Scenario: cliCwd provided
- **WHEN** `loadConfig("/home/user/myproject", options)` is called
- **THEN** `startupPath` SHALL be the resolved absolute path of `/home/user/myproject`
- **AND** `projectPath` SHALL equal `startupPath`

#### Scenario: cliCwd omitted or undefined
- **WHEN** `loadConfig(undefined, options)` is called
- **THEN** `startupPath` SHALL resolve from `options.environment.DSCODE_PROJECT_PATH` or `options.currentWorkingDirectory`
- **AND** the loader SHALL not mutate process-global state
