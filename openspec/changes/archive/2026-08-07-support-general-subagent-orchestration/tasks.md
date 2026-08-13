## 1. Bundled general Application

- [x] 1.1 Add `resources/agents/general.md` with inherited model/tools and a fresh-worker prompt
- [x] 1.2 Register `agent:general` in the resource catalog and required build resource list
- [x] 1.3 Extend bundled resource tests to validate and package `general.md`

## 2. Application Discovery

- [x] 2.1 Expose stable read-only Application summaries from AgentSupervisor
- [x] 2.2 Project the live Application catalog into the model-visible `spawn_agent` description
- [x] 2.3 Add tests for discovered project Agent.md entries and Registry reload visibility

## 3. Contract And Verification

- [x] 3.1 Update Agent.md documentation for bundled `general`, professional-Agent preference, and fresh transcript semantics
- [x] 3.2 Add acceptance coverage for multiple independent `general` processes using the existing parallel execution path
- [x] 3.3 Run OpenSpec validation, SubAgent tests, typecheck, and package build verification

## 4. Runtime Trace Feedback

- [x] 4.1 Strengthen the validation Skill so Main cannot silently skip available SubAgents
- [x] 4.2 Resolve project-local image file attachments to cached ImageRefs before spawn
- [x] 4.3 Reject forged, missing, oversized, or cwd-escaping image references with regression tests
- [x] 4.4 Re-run Skill validation, SubAgent tests, typecheck, OpenSpec validation, and package build
