## 1. Implementation

- [x] 1.1 Add `"--no-open"` to the `od` binary command args in `resolveOdCommand` (`src/core/od-daemon.ts`)
- [x] 1.2 Add `"--no-open"` to the pnpm fallback command args in `resolveOdCommand` (`src/core/od-daemon.ts`)
- [x] 1.3 Fix `waitForOdDaemon` health check URL from `/health` (nonexistent) to `/api/projects` (real endpoint) in `src/core/od-daemon.ts`

## 2. Verification

- [x] 2.1 Run `npm run typecheck` to ensure no compilation errors
- [x] 2.3 Confirm `waitForOdDaemon` succeeds (no "did not become healthy" warning) on `npm start -- --with-od`
- [x] 2.2 Run `npm start -- --with-od` and confirm no browser window opens automatically (manual verification needed at runtime)
