## 1. Update loadConfig to accept optional cliCwd

- [x] 1.1 Change `loadConfig()` signature to accept `cliCwd?: string` parameter
- [x] 1.2 In `loadConfig()`, when `cliCwd` is provided and non-empty, use `resolve(cliCwd)` as `startupPath` instead of `resolve(process.env.DSCODE_PROJECT_PATH ?? process.cwd())`

## 2. Update parseArgs to handle --cwd

- [x] 2.1 Add `cwd` to the `parseArgs()` return type (`{ web: boolean; webPort: number; debug: boolean; cwd?: string }`)
- [x] 2.2 Add parsing logic: `--cwd` followed by a path argument, resolved to absolute via `path.resolve()`
- [x] 2.3 Handle edge case: if `--cwd` is the last argument with no path value, ignore it (graceful)

## 3. Wire parseArgs → main → loadConfig

- [x] 3.1 Destructure `cwd` from `parseArgs()` in `main()`
- [x] 3.2 Pass `cwd` to `loadConfig(cliCwd)`

## 4. Verification

- [x] 4.1 Run `npm run typecheck` and fix any type errors
- [x] 4.2 Manual smoke test: `--cwd /tmp --debug` starts without error
- [x] 4.3 Manual smoke test: `--cwd <path>` parsed correctly alongside other flags
- [x] 4.4 Manual smoke test: no `--cwd` works as before
