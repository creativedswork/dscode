## 1. Data Layer — SessionStore & SessionManager

- [x] 1.1 Add `loadSessionFile(sessionId: string): Promise<SerializedSession | null>` public method to `src/session/store.ts`
- [x] 1.2 Add `getSessionFilePath(idOrPrefix: string): { path: string; metadata: SessionMetadata } | null` method to `src/session/manager.ts` with prefix matching (minimum 8 characters)
- [x] 1.3 Verify existing session file directory scanning logic is reusable for `getSessionFilePath`

## 2. Analysis Engine — src/eval/

- [x] 2.1 Create `src/eval/` module directory with `EvalResult`, `PhaseInfo`, `DeviationPoint`, `RootCause` TypeScript interfaces
- [x] 2.2 Implement `analyzeSession(data: SerializedSession): EvalResult` — metadata extraction and message role distribution stats
- [x] 2.3 Implement tool call statistics: count total calls, errors, error rate, screenshots, user complaints
- [x] 2.4 Implement Phase auto-detection: scan `assistant.thinking` text for intent signals, detect tool call pattern mutations, detect user complaint messages
- [x] 2.5 Implement keyword deviation detection: extract target keywords from user's first message + title, extract visual keywords from screenshot descriptions using regex, compute Jaccard distance, flag deviation points
- [x] 2.6 Implement root cause inference: detect "effect overload" and "perception blind spot" patterns
- [x] 2.7 Implement `extractScreenshotKeywords(description: string): string[]` helper for Chinese screenshot descriptions
- [x] 2.8 Implement `generateSuggestions(result: EvalResult): string[]` helper

## 3. Dashboard HTML Generation

- [x] 3.1 Implement `generateDashboardHTML(result: EvalResult): string` — dark-themed HTML template with inline CSS
- [x] 3.2 Build header section: session metadata display (ID, title, model, message count, duration)
- [x] 3.3 Build summary stat cards: total messages, tool calls, error rate, deviation ratio with color coding (ok=#3fb950, warn=#d2991d, danger=#f85149)
- [x] 3.4 Build Phase timeline section: horizontal bars with labels, message ranges, and status indicators
- [x] 3.5 Build root cause analysis section: display each root cause with title, description, evidence message indices
- [x] 3.6 Build suggestions section
- [x] 3.7 Implement HTML-escape for all user-provided text (title, messages, descriptions)
- [x] 3.8 Implement `generateDashboard(result: EvalResult, outputPath: string): string` — write HTML to file, return file path
- [x] 3.9 Implement `openDashboard(filePath: string): void` — cross-platform browser open (macOS: `open`, Linux: `xdg-open`, Windows: `start`) with graceful fallback

## 4. Slash Command Integration

- [x] 4.1 Add `eval` command definition to `src/ui/commands.ts` with name, description, and execute function
- [x] 4.2 Implement execute function: resolve session ID (use current if no arg), locate session file, load data, run analysis, generate dashboard, open browser
- [x] 4.3 Add eval command to slash command help text

## 5. Testing

- [ ] 5.1 Test `/eval` with no arguments (current session)
- [ ] 5.2 Test `/eval <valid_full_id>`
- [ ] 5.3 Test `/eval <8-char-prefix>`
- [ ] 5.4 Test `/eval <invalid_id>` — verify error message, no dashboard generated
- [ ] 5.5 Test empty session analysis — all fields populated, no crash
- [ ] 5.6 Test HTML escaping — user messages with `<script>`, `&`, quotes not executed
- [ ] 5.7 Manual smoke test with a real multi-phase session (e.g., 8MB+ JSON), verify analysis time < 3s
