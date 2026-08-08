## 1. Canonical conversation and Tool result model

- [x] 1.1 Add stable `toolCallId` and optional `ToolResultProjection` fields to shared Main/SubAgent Tool Activity types
- [x] 1.2 Update canonical conversation actions/reducer to upsert Main Tools by toolCallId and preserve summary plus lossless inline/ref detail
- [x] 1.3 Add a shared Harness-event adapter so TUI and Web apply the same conversation transition semantics
- [x] 1.4 Update display reconstruction to preserve Tool identity/result references for history without inventing missing legacy data
- [x] 1.5 Add reducer and history tests for parallel same-name Tools, large result references, legacy records, and no input mutation

## 2. SubAgent Tool result projection

- [x] 2.1 Extend `PiAgentRuntimeAdapter` Tool end progress with normalized result/error detail or Agent Process result reference
- [x] 2.2 Update `AgentActivityProjector` to retain args and result detail by `agentId + toolCallId`
- [x] 2.3 Verify Permission waiting/resolved progress continues to bind the same Tool Activity after result fields are added
- [x] 2.4 Add projector tests for completed, failed, parallel same-name, Permission, and legacy SubAgent Tool Activities

## 3. TUI canonical state migration

- [x] 3.1 Refactor `TuiBackend` to dispatch canonical conversation actions instead of mutating separate live buffers directly
- [x] 3.2 Refactor `ConversationView` to render canonical `UIMessage[]` and AgentActivity snapshots for both live and replay paths
- [x] 3.3 Remove duplicate `thinkingBuffer`, `toolEntries`, replay-only Tool matching, and presentation-time result truncation after parity is proven
- [x] 3.4 Preserve existing image rendering, spawn-agent deduplication, token stats, retries, and Session switching through focused regression tests

## 4. Activity Inspector and disclosure

- [x] 4.1 Implement `TuiActivityInspector` as a capturing pi-tui overlay with stable activity IDs and current-activity auto-selection
- [x] 4.2 Implement `Ctrl+E` open/close with Editor text preservation and explicit focus restoration
- [x] 4.3 Implement `Tab` / `Shift+Tab`, auxiliary arrow/J/K navigation, `Enter`/`→` activate, and `←` collapse/back behavior
- [x] 4.4 Add disclosure state storage keyed by stable activity ID and preserve manual state across streaming progress updates
- [x] 4.5 Remove global `Ctrl+R`, `Ctrl+O`, and `Ctrl+N` disclosure routing and obsolete selection fields
- [x] 4.6 Add component/input tests for auto-selection priority, wraparound navigation, stable selection, Thinking expansion, and missing-item fallback

## 5. Tool output viewport

- [x] 5.1 Render Main and SubAgent Tool summaries in Chat while exposing complete detail through the selected Tool
- [x] 5.2 Implement fixed-height output viewport with line range, `↑`/`↓`/`J`/`K`, `PgUp`/`PgDn`, `Home`/`End`, and `←`/`Esc` return
- [x] 5.3 Resolve large result refs from Session transcript or Agent Process Store without copying the entire result on each render
- [x] 5.4 Add tests proving a result beyond the former 2000-character and 120-character limits remains fully pageable

## 6. Owner-bound Permission interaction

- [x] 6.1 Move TUI Permission input handling into a focused owner-bound component while preserving Harness-level serialization
- [x] 6.2 Implement direct `1-4`, `Enter`, and `D` actions, including number-only exact/fuzzy scope selection
- [x] 6.3 Restore prior Inspector selection or Editor focus after allow, deny, guidance, cancellation, and Session switch
- [x] 6.4 Add tests for SubAgent Tool ownership, focus lock, direct decisions, no permanent Permission message, and fallback Main Permission

## 7. Verification and prototype lifecycle

- [x] 7.1 Run focused UI/runtime tests, full TypeScript typecheck, production build, and strict OpenSpec validation
- [x] 7.2 Use tuistory at 120x36 and 80x24 to verify streaming `Ctrl+E → Enter`, Tab navigation, long output paging, and SubAgent Permission decisions
- [x] 7.3 Verify normal Editor input and abort behavior remain functional while old disclosure shortcuts no longer mutate Conversation state
- [x] 7.4 Compare the implementation with `docs/prototypes/archive/2026-08-08-redesign-tui-conversation-interaction/redesign-tui-conversation-interaction-workbench.html` and finalize its retention decision as `archive` or `delete`

## 8. Screenshot-driven Chat compactness regression

- [x] 8.1 Compact user messages over 1000 characters or 10 lines in both live and replay rendering while preserving canonical full text
- [x] 8.2 Add focused tests and verify the reported large-paste flow in a real 120x36 PTY

## 9. Complete interaction audit

- [x] 9.1 Enforce active/completed Execution disclosure defaults, preserve manual Inspector choices, and lock Permission owners expanded
- [x] 9.2 Make duplicate assistant starts idempotent and treat empty Tool results as completed
- [x] 9.3 Make processing transitions idempotent and show image-routing notices only for actual image input
- [x] 9.4 Resolve historical Agent Process result refs after Session replay and preserve foreground/background attachment
- [x] 9.5 Add focused regression tests for every audit finding
- [x] 9.6 Run full tests, build, strict validation, and real `node ./dist/dscode.mjs --cwd ...` PTY checks at 120x36 and 80x24
- [x] 9.7 Keep multiline Main Tool result summaries to one Chat row while retaining full Inspector output
- [x] 9.8 Bound mixed-width Thinking by terminal columns, ignore Kitty key releases, lock Editor input during processing, and align processing tips
- [x] 9.9 Add line scrolling and two-level Esc navigation for Tool output viewports
