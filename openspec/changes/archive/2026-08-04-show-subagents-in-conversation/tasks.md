## 1. Shared Conversation Model

- [x] 1.1 Add canonical `AgentActivity` and agent-role conversation types to `src/ui/shared/types.ts`
- [x] 1.2 Add the `agent_activity` ServerEvent snapshot to the shared Web protocol
- [x] 1.3 Extend `conversationReducer` to insert and update Agent Activity by agentId without mutating prior state
- [x] 1.4 Add reducer tests for spawn, progress, terminal update, duplicate terminal snapshot, ready replay, and clear

## 2. Agent Event Projection

- [x] 2.1 Implement a runtime-to-UI Agent Activity snapshot mapper using generic Agent Process and exit data
- [x] 2.2 Subscribe the Web backend to Agent spawned, state, progress, output, and exit events
- [x] 2.3 Filter realtime snapshots by explicit `parentSessionId` before broadcasting to the visible conversation
- [x] 2.4 Deduplicate unchanged progress snapshots while always forwarding terminal snapshots
- [x] 2.5 Add Web backend tests for foreground/background lifecycle updates and cross-Session isolation

## 3. Session History Reconstruction

- [x] 3.1 Extend `rebuildDisplayMessages` to emit agent-role display records from `agentMessages`
- [x] 3.2 Place historical Agent Activity deterministically using messageIndex, timestamps, then tail fallback
- [x] 3.3 Preserve existing image restoration, tool-result matching, and legacy Vision migration behavior
- [x] 3.4 Add display reconstruction tests for linked, timestamped, fallback, failed, and legacy Agent records
- [x] 3.5 Verify Session loading restores Activity without creating or resuming Agent Processes

## 4. Web Agent Activity Card

- [x] 4.1 Add `AgentActivityCard` routing for role=agent messages in `ChatView`
- [x] 4.2 Render Application, status text/icon, attachment, elapsed/final duration, input, progress, output, and error summaries
- [x] 4.3 Implement accessible keyboard-operable output details with `aria-expanded` and bounded scrolling
- [x] 4.4 Add running, waiting, completed, failed, terminated, and killed styles using existing semantic CSS tokens
- [x] 4.5 Add Agent Activity as a dedicated collider without assistant phase-label semantics
- [x] 4.6 Add component tests for statuses, summary truncation, details toggling, accessibility, and scroll behavior

## 5. TUI Agent Activity

- [x] 5.1 Route the canonical Agent Activity projection into TUI realtime event handling
- [x] 5.2 Render compact Application, state, duration, input, progress, output, and error summaries in `ConversationView`
- [x] 5.3 Replay display-ready agent-role history in TUI while preserving existing text, tool, thinking, and image output
- [x] 5.4 Replace the background Agent completion-only toast path with the conversation Activity update
- [x] 5.5 Add TUI tests for realtime completion, failure, history replay, and cross-Session isolation

## 6. Verification

- [x] 6.1 Run focused shared reducer, session display, Web backend, Web component, and TUI tests
- [x] 6.2 Run project typecheck and build
- [x] 6.3 Run the full test suite and document any unrelated baseline failures
- [x] 6.4 Validate `show-subagents-in-conversation` with OpenSpec strict validation
- [x] 6.5 Manually verify Web and TUI foreground/background Agent flows, Session switching, history reload, and details expansion

## 7. UI Conformance Fixes

- [x] 7.1 Route `agent_activity` through the Web App conversation reducer
- [x] 7.2 Require Vision to use AgentSupervisor whenever the Agent system is enabled
- [x] 7.3 Separate runtime prompt enrichment from user-facing Agent Activity input
- [x] 7.4 Align TUI Agent Activity text hierarchy with the approved prototype
- [x] 7.5 Display Agent Process IDs as labeled six-character short IDs in Web and TUI
