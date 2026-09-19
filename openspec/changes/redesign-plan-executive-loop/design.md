## Context

`add-interactive-plan-mode` established durable Plan semantics, execution bindings,
verification evidence, and Main-owned TaskState. It does not yet bound the lower-level
model/tool loop that consumes an approved Plan. The current continuation logic only
checks for a stalled Plan after a model turn without Tool Calls. A model that keeps
requesting successful tools can therefore run indefinitely even when no verification,
Plan step, or user-visible outcome changes.

Session `00MU6UD8KVT6VVQN5OHHN4D3YY` demonstrates the failure mode: more than 230 Tool
Calls, 22 equivalent edits, Plan version 232, and 214 evidence records were produced
while the first Plan step and the initial TaskState remained unchanged. Tool activity
was mistaken for useful execution.

The design must retain the existing cognitive boundaries:

- PlanRecord holds semantic intent and verification state.
- TaskState holds user-visible outcome progress and TODO.
- AgentProcess is the resumable worker; Session remains the TTY.
- The Host owns scheduling, permissions, persistence, and objective lifecycle facts.
- Model reasoning remains private; only concise facts and decisions are persisted.

The implementation must use the existing `pi-agent-core` turn-stop seam, PlanStore,
AgentProcessStore, HarnessEventBus, and Chat projections. It cannot rely on the model
voluntarily ending a loop. The currently locked `pi-agent-core@0.80.10` contains
`AgentLoopConfig.shouldStopAfterTurn` in its low-level loop but does not expose that
hook through high-level `AgentOptions`. The first implementation gate is therefore an
aligned pi package upgrade to at least `0.84.0`, where the public `Agent` forwards the
hook. That package line requires Node.js `>=22.19.0`.

## Goals / Non-Goals

**Goals:**

- Bound every approved-Plan execution attempt as a Host-owned execution episode.
- Detect objective progress and repeated no-progress behavior deterministically.
- Permit exactly one bounded reflection attempt before pausing inconclusively.
- Preserve the Plan, execution binding, TaskState, and TODO when automatic execution
  pauses.
- Let the user adjust the approach or continue from the saved facts without inheriting
  an exhausted episode budget.
- Keep persisted Plan evidence proportional to acceptance criteria rather than Tool
  Call volume.
- Expose one presentation-neutral state to Web, TUI, reconnecting clients, and tests.

**Non-Goals:**

- Building a Critic Agent, evaluator swarm, external scheduler, or background service.
- Inferring semantic progress from file versions, timestamps, token use, Tool success,
  transcript length, evidence count, or Plan version.
- Implementing preemptive interruption during an in-flight model response or Tool
  invocation.
- Automatically changing product intent, Plan constraints, or the approved digest.
- Marking unresolved work as blocked, failed, skipped, or completed.
- Copying the complete Tool transcript into PlanStore.
- Guaranteeing that every logically different action has a different fingerprint.

## Decisions

### 1. Harness owns a bounded execution episode

An `ExecutionEpisode` is scheduling state associated with one approved Plan execution,
not a new Agent or Session:

```ts
type ExecutionEpisodePhase =
  | "running"
  | "reflecting"
  | "paused_inconclusive"
  | "completed";

interface ExecutionEpisodeSnapshot {
  episodeId: string;
  planId: string;
  planRevision: number;
  planDigest: string;
  sessionId: string;
  mainAgentId: string;
  phase: ExecutionEpisodePhase;
  turnCount: number;
  toolCallCount: number;
  noProgressActionCount: number;
  reflectionUsed: boolean;
  startedAt: number;
  updatedAt: number;
  progress: ExecutionProgressSnapshot;
  incident?: ExecutionIncidentSummary;
}
```

The Harness starts an episode when Main begins or explicitly resumes an approved Plan.
It observes turn and Tool lifecycle events and passes a synchronous stop predicate into
the `pi-agent-core` loop. A threshold reached during a Tool batch is recorded
immediately, but the Host stops after the current turn through `shouldStopAfterTurn`;
it does not cancel a Tool midway.

The pi package family is upgraded together to avoid mixed `pi-ai` runtime and type
identities, and the project Node.js engine floor becomes `>=22.19.0`. Implementation
must verify existing provider, TUI, Tool hook, and Agent lifecycle behavior before
building the monitor. Copying the low-level Agent loop into dscode or patching
`node_modules` is rejected because either approach would create a private runtime fork.

The initial policy is deliberately finite and centralized:

```ts
const EXECUTION_EPISODE_POLICY = {
  maxTurns: 12,
  maxToolCalls: 80,
  maxNoProgressActions: 16,
  maxEquivalentActions: 3,
  reflectionMaxTurns: 4,
  reflectionMaxToolCalls: 20,
};
```

Policy values are included in the snapshot used for diagnostics and tests. They are
not model-controlled and are not inferred from Plan size. Hard turn and Tool limits
remain a final guard even when fingerprints are all distinct.

Alternatives considered: extending `continueIncompletePlan` with more follow-up
counters cannot stop a single turn that continuously emits Tool Calls and repeats the
incident's blind spot. Using only `afterToolCall.terminate` cannot reliably stop batches
containing immediate rejection results because that hook does not finalize every Tool
path. Both are rejected in favor of the public turn-stop hook.

### 2. Progress is a comparison of semantic outcome snapshots

`ExecutionProgressSnapshot` contains only:

- verification IDs whose persisted evidence currently passes their structured matcher;
- each Plan execution step's persisted status;
- TaskState status and each TodoItem's persisted status, result, and blocker outcome.

Progress occurs when comparison with the episode's last accepted snapshot finds a new
passing verification, a Plan step status transition, or a TaskState/TodoItem outcome
transition. Reordering, wording-only TODO edits, timestamps, versions, raw evidence
count, Tool completion, filesystem mutation, and Agent messages do not reset
no-progress counters.

The monitor reads committed PlanStore and AgentProcessStore snapshots after lifecycle
mutations. It does not trust a Tool's self-description. A failed or inconclusive
verification remains no progress even when the verification command exits normally but
does not satisfy its matcher.

Alternative considered: count any successful write or evidence append as progress.
The incident shows that this rewards repeated damage and allows unbounded evidence
growth without moving an acceptance criterion.

### 3. Stable fingerprints identify equivalent no-progress patterns

For every completed Tool Call the Host constructs:

```ts
interface ExecutionActionFingerprint {
  action: string;
  semanticArguments: unknown;
  outcomeClass:
    | "succeeded"
    | "rejected"
    | "failed"
    | "inconclusive";
}
```

`action` is the canonical Tool/driver operation. `semanticArguments` is produced by a
per-effect normalizer using stable resource identity and operation intent, such as a
normalized workspace path plus edit target/range or a command class plus canonical
arguments. Call IDs, timestamps, temporary paths, formatting-only differences,
response text, file versions, and generated evidence IDs are excluded. Unknown tools
fall back to canonical JSON with volatile protocol fields removed.

The monitor stores bounded counters and a small recent ring of fingerprints, not Tool
payloads. An equivalent fingerprint repeated three times without semantic progress is
an impasse even if every Tool reports success. Sixteen non-equivalent no-progress
actions or either hard budget also constitute an impasse.

Alternative considered: hash raw Tool input. It is easy to evade accidentally through
call IDs, whitespace, or offsets and cannot group semantically equivalent edits.

### 4. One reflection is a bounded restart, not another autonomous role

On the first impasse, the Host:

1. stops the current loop after its turn;
2. persists an `ExecutionIncidentSummary` containing the triggering rule, bounded
   fingerprint counts, unchanged progress snapshot, and the last relevant errors;
3. emits the reflecting state;
4. starts one short Main episode with a Host-authored resume frame.

The resume frame asks Main to compare the unchanged acceptance state with the incident,
choose a materially different tactic, and continue only within the existing Plan
authorization. It does not request hidden Chain-of-Thought and does not create a Critic
Agent. The reflection episode has the smaller turn and Tool budgets above.

If semantic progress occurs, counters reset but `reflectionUsed` remains true for that
execution attempt. Any later impasse pauses automatically; the Host never starts a
second reflection. A material Plan conflict still follows the existing explicit
replanning protocol.

Alternative considered: an independent Critic process. It introduces another
capability boundary, prompt contract, and failure mode without adding authoritative
facts beyond those already held by the Host monitor.

### 5. Inconclusive pause is a first-class execution state

`PlanExecutionState` gains optional episode state. `paused_inconclusive` means automatic
execution stopped without evidence of completion, failure, or an external blocker.
The current Plan status remains executable, all step states and bindings are preserved,
and TaskState/TODO are not mutated by the pause.

The pause snapshot records a concise reason and two commands:

- `adjust_plan`: return foreground control to planning with the incident and current
  facts. Any semantic change creates a normal new revision/digest and authorization.
- `continue_execution`: start a fresh bounded episode against the same revision and
  digest. It gets new budgets, but the incident history records that the user
  explicitly resumed.

Both commands use command IDs, expected versions, and existing CAS/idempotency
conventions. Continue is rejected if the Plan revision/digest or owning TaskState no
longer matches. Automatic timers or reconnects never resume a paused episode.

Alternative considered: map pause to `blocked`. `blocked` requires a known external
blocker and recovery path; an exhausted or repetitive execution is only unverified.

### 6. Persist acceptance evidence and bounded incident summaries

PlanStore retains evidence only when it is referenced by a declared verification and
needed to reproduce that verification's current result. Superseded failed attempts and
generic Tool/Agent progress are not appended indefinitely. A step keeps the evidence
supporting its latest matcher evaluation plus a bounded incident summary; the complete
Tool trace remains in Session/Process history.

Episode snapshots and incident summaries are persisted with execution state so
reconnect and process restoration display the same state. The recent fingerprint ring
is bounded to the policy window. Raw Tool outputs are referenced by trace identity when
needed, not duplicated.

Alternative considered: retain every observation for auditability. The Session already
owns that audit trail; duplicating it caused Plan version churn and made PlanStore an
unbounded transcript.

### 7. API, events, WebSocket, Web, and TUI share one state contract

HarnessAPI exposes a read-only episode snapshot and two narrow mutation commands.
HarnessEventBus emits presentation-neutral `plan:episode` and `plan:impasse` events.
WebSocket serializes those events and commands without inventing client-side state.

Web and TUI render the state inside the existing Chat execution hierarchy:

- running: current outcome count and bounded activity;
- reflecting: one reflection attempt is in progress;
- paused: `未验证`, the retained TODO, a concise reason, and adjust/continue actions;
- completed: only when persisted Plan verification and TaskState completion agree.

Reconnect obtains the snapshot from the server. Clients never infer completion or
pause from a disconnected socket, an idle timer, or a missing streaming event.

## Risks / Trade-offs

- [Fingerprint normalization groups distinct edits] -> Fingerprints only trigger a
  bounded reflection/pause, never destructive rollback or failure; per-tool normalizers
  have focused equivalence tests.
- [A useful long-running task reaches a hard cap] -> The user can explicitly resume
  with fresh budgets, while preserving all verified progress.
- [A Tool hangs inside one invocation] -> Episode stopping is cooperative at the turn
  boundary; existing Tool timeout/cancellation remains responsible for in-flight hangs.
- [TaskState wording edits could look like progress] -> Only status/result/blocker
  outcome changes count; title, ordering, version, and history do not.
- [Evidence pruning loses forensic detail] -> Full Tool and model events remain in the
  Session/Process trace and retained evidence keeps trace references.
- [Plan and TaskState reads race] -> The monitor compares committed snapshots after
  lifecycle events and treats conflicts as no progress until a coherent snapshot can be
  loaded.
- [Repeated explicit resumes can still consume resources] -> Every resume is visible,
  user-initiated, bounded, and recorded; there is no automatic restart chain.
- [The public stop hook requires a pi and Node.js baseline upgrade] -> Upgrade the
  aligned pi package family first, run existing runtime regressions as an explicit gate,
  and stop implementation instead of introducing a private loop fork if compatibility
  cannot be established.

## Migration Plan

1. Upgrade the aligned pi package family to at least `0.84.0`, raise the Node.js engine
   floor to `>=22.19.0`, and verify the existing runtime behavior before further edits.
2. Add optional episode fields to Plan execution schema and readers so existing Plan
   records load unchanged.
3. Implement the monitor and stop predicate behind the approved-Plan execution path;
   direct, Planner, and legacy sessions remain unaffected.
4. Replace the current follow-up-only stall counters with episode scheduling while
   retaining the existing completion-report continuation.
5. Add API, event, WebSocket, Web, and TUI projections with backward-compatible
   handling when no episode snapshot exists.
6. Replay the captured incident as a fixture and verify pause before the repeated edit
   count can reach 22.

Rollback disables episode scheduling and ignores the optional persisted fields. It does
not require rewriting PlanRecord or TaskState data.

## Open Questions

- Whether policy values should become advanced user settings after production telemetry;
  they remain fixed constants for this change.
- Which MCP tools merit dedicated semantic argument normalizers after the initial
  filesystem, command, and generic canonical-JSON implementations.
