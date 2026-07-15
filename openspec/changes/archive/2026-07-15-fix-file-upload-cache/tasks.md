## 1. Shared types — cache protocol

- [x] 1.1 Add `{ type: "cache"; action: "size" | "clear" }` to `ClientCommand` union in `src/ui/shared/types.ts`
- [x] 1.2 Add `{ type: "cache_size"; totalBytes: number; fileCount: number; sessionCount: number }` to `ServerEvent` union in `src/ui/shared/types.ts`
- [x] 1.3 Run `npm run typecheck` and verify no type errors in shared types

## 2. Server-side cache management (web-backend.ts)

- [x] 2.1 Add `handleCache` method to `WebUiBackend` that handles `{ type: "cache", action: "size" }` — scans `.dscode/uploads/` recursively, sums file sizes, counts files and session directories, responds with `cache_size` event
- [x] 2.2 Add handling for `{ type: "cache", action: "clear" }` — calls `rmSync` on `.dscode/uploads/` recursively, then responds with `cache_size` showing 0
- [x] 2.3 Wire `cache` case in `handleMessage` switch to call `handleCache`
- [x] 2.4 Wire `cleanupUploadDir(sessionId)` into session deletion path — find the `session` → `delete` handler and call cleanup after successful deletion
- [x] 2.5 Run `npm run typecheck` and verify web-backend compiles

## 3. Frontend — file size limits (MessageInput.tsx)

- [x] 3.1 Change `MAX_FILE_SIZE` from `50 * 1024` to `10 * 1024 * 1024` (10 MB)
- [x] 3.2 Change `MAX_TOTAL_SIZE` from `200 * 1024` to `50 * 1024 * 1024` (50 MB)
- [x] 3.3 In `handleDrop`, when a non-image file exceeds the single-file limit, skip it AND produce a toast via a new `onToast` callback prop (format: "File '<name>' exceeds 10 MB limit")
- [x] 3.4 When the total batch exceeds the total limit, skip remaining files AND produce a toast via `onToast` (format: "Total file size exceeds 50 MB limit")
- [x] 3.5 Add `onToast?: (type: "warning" | "error", text: string) => void` to `MessageInputProps` interface
- [x] 3.6 Run `npm run typecheck` and verify MessageInput compiles

## 4. Frontend — cache block in Settings panel (Sidebar.tsx)

- [x] 4.1 Add `cacheSize` state to `SettingsPanel` (type: `{ totalBytes: number; fileCount: number; sessionCount: number } | null`)
- [x] 4.2 Add `cacheClearing` boolean state to `SettingsPanel`
- [x] 4.3 On Settings tab activation, send `{ type: "cache", action: "size" }` command — add `onCacheAction` callback to `SidebarProps` and `SettingsPanelProps`
- [x] 4.4 Render Upload Cache block between "Project Path" and the vision model section: bordered card with size (mono font, 16px), subtext ("X files · X sessions"), and Clear button
- [x] 4.5 Apply `danger` styling when `totalBytes > 40 * 1024 * 1024` (red border, "Consider clearing" helper)
- [x] 4.6 Clear button sends `{ type: "cache", action: "clear" }` and enters clearing state
- [x] 4.7 When `cacheSize` is null, show loading state ("..." + "calculating..."); when zero, show "0 B" and disable Clear button
- [x] 4.8 Run `npm run typecheck` and verify Sidebar compiles

## 5. Frontend — wire everything in App.tsx

- [x] 5.1 Add `handleCacheAction` callback that sends cache commands via WebSocket
- [x] 5.2 Handle `cache_size` server event in `handleEvent` — update state passed to SettingsPanel
- [x] 5.3 Pass `onToast` to `MessageInput` wrapping `addToast` for size-limit warnings
- [x] 5.4 Pass `onCacheAction` and `cacheSize`/`cacheClearing` state to `Sidebar` → `SettingsPanel`
- [x] 5.5 Run `npm run typecheck` and verify App.tsx compiles

## 6. Validation

- [x] 6.1 Manual test: drag a PDF >10MB and verify toast appears, file not uploaded
- [x] 6.2 Manual test: drag a small PDF (<10MB), open Settings → verify cache size updates
- [x] 6.3 Manual test: click Clear Cache → verify cache resets to 0 B
- [x] 6.4 Manual test: delete a session that has uploads → verify `.dscode/uploads/<sessionId>/` is removed
- [x] 6.5 Run `npm test` and verify no regressions
