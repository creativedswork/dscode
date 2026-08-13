## MODIFIED Requirements

### Requirement: CLI --cwd flag sets startup working directory

The CLI entry point in `src/bootstrap/cli-main.ts` SHALL accept a
`--cwd <path>` option. When provided, the resolved absolute path SHALL be used
as the Host startup working directory (`startupPath` / `projectPath`), taking
precedence over the captured `DSCODE_PROJECT_PATH` environment variable and
current working directory. CLI and Application code MUST NOT call
`process.chdir()` to apply the project path.

#### Scenario: --cwd with valid absolute path

- **WHEN** dscode is invoked as `dscode --cwd /home/user/myproject`
- **THEN** `startupPath` and `projectPath` SHALL be `/home/user/myproject`
- **AND** the standard Agent Host SHALL use that path as its workspace
- **AND** the process-global working directory SHALL remain unchanged

#### Scenario: --cwd with relative path

- **WHEN** dscode is invoked as `dscode --cwd ./myproject`
- **THEN** `startupPath` SHALL be resolved against the CLI process working directory captured at startup

#### Scenario: --cwd takes precedence over DSCODE_PROJECT_PATH

- **WHEN** dscode is invoked as `DSCODE_PROJECT_PATH=/other dscode --cwd /home/user/myproject`
- **THEN** `startupPath` SHALL be `/home/user/myproject`

#### Scenario: --cwd composes with --debug

- **WHEN** dscode is invoked as `dscode --cwd /home/user/myproject --debug`
- **THEN** the Host workspace SHALL be `/home/user/myproject`
- **AND** debug mode SHALL be enabled

#### Scenario: --cwd composes with --web

- **WHEN** dscode is invoked as `dscode --cwd /home/user/myproject --web --web-port 8080`
- **THEN** the Host workspace SHALL be `/home/user/myproject`
- **AND** the Web server SHALL start on port 8080
- **AND** the Web server SHALL resolve built SPA assets independently of the Host workspace

#### Scenario: No --cwd flag

- **WHEN** dscode is invoked without `--cwd`
- **THEN** `startupPath` SHALL resolve from the captured `DSCODE_PROJECT_PATH` or startup current working directory

### Requirement: loadConfig accepts optional cliCwd parameter

The `loadConfig()` function in `src/config/loader.ts` SHALL accept an optional
`cliCwd?: string` parameter plus explicit environment and current-working-
directory inputs. When `cliCwd` is provided and non-empty, it SHALL be resolved
and used as `startupPath` instead of the environment/current-directory fallback
chain.

#### Scenario: cliCwd provided

- **WHEN** `loadConfig("/home/user/myproject", options)` is called
- **THEN** `startupPath` SHALL be the resolved absolute path of `/home/user/myproject`
- **AND** `projectPath` SHALL equal `startupPath`

#### Scenario: cliCwd omitted or undefined

- **WHEN** `loadConfig(undefined, options)` is called
- **THEN** `startupPath` SHALL resolve from `options.environment.DSCODE_PROJECT_PATH`
  or `options.currentWorkingDirectory`
- **AND** the loader SHALL NOT mutate `process.cwd()` or `process.env`
