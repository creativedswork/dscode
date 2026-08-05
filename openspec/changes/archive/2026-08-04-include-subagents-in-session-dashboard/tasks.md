## 1. Dashboard Cache Identity

- [x] 1.1 Extract a deterministic Dashboard content-hash helper that accepts Main messages and migrated `agentMessages`
- [x] 1.2 Use the shared helper when saving the current Session and when upserting an Agent record into a non-current Session
- [x] 1.3 Add tests for stable hashes, Agent field changes, current Session completion, non-current background completion, and legacy Sessions without Agent records

## 2. SubAgent Summary Data

- [x] 2.1 Add bounded text normalization and duration formatting helpers for Dashboard Agent records
- [x] 2.2 Extend `buildSessionSummary()` with SubAgent totals, outcome counts, success rate, delegated duration, per-Application counts, and creation-ordered execution records
- [x] 2.3 Keep Main token/tool statistics independent from SubAgent aggregates and avoid reading Agent Process transcripts
- [x] 2.4 Add summary tests for completed, failed, empty, legacy Vision, and oversized input/output records

## 3. Dashboard Generation Contract

- [x] 3.1 Update the Session Dashboard generation prompt to require SubAgent headline metrics, Agent Processes records, semantic failure states, and an explicit Main-Agent-only empty state
- [x] 3.2 Require six-character Agent IDs and separate labels for delegated duration versus Session active time
- [x] 3.3 Add prompt-contract tests confirming SubAgent data and visual requirements are passed to the artifact model

## 4. Verification

- [x] 4.1 Run focused Session manager, Dashboard summary, Web backend, and cache tests
- [x] 4.2 Run project typecheck, Web build, and full build
- [x] 4.3 Generate Dashboards for completed, failed, and no-SubAgent fixtures and compare them with the approved HTML prototype
- [x] 4.4 Validate `include-subagents-in-session-dashboard` with strict OpenSpec validation

## 5. Overview-Only Agent Records

- [x] 5.1 Replace Dashboard Agent input/result fields with 100/120-character one-line task/outcome summaries
- [x] 5.2 Forbid transcript-style Input/Result blocks, full text, multi-paragraph content, and expandable Agent details in the generation prompt
- [x] 5.3 Bump Dashboard content identity so cached detailed artifacts regenerate
- [x] 5.4 Update summary, prompt-contract, cache-version, build, and strict OpenSpec verification
