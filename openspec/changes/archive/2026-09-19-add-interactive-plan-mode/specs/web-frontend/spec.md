## ADDED Requirements

### Requirement: Web keeps planning under Agent control
The Web composer SHALL remain a single Chat input and SHALL NOT expose an
`Auto / Plan` selector, Plan workbench, dedicated Plan page, or separate
planning navigation. Main Agent SHALL decide whether to execute directly,
investigate, or use the internal Planner.

#### Scenario: User submits a sufficiently specified request
- **WHEN** the request contains enough user intent to determine the visible outcome
- **THEN** the Agent proceeds through the existing Chat experience without opening a planning surface

#### Scenario: Agent uses an internal Plan
- **WHEN** complexity routing starts or revises an internal PlanRecord
- **THEN** the Web UI does not expose routing scores, candidates, revision, digest, effect grants, evidence, control tools, or Agent process details

### Requirement: Authorized Plan has one global Chat output
After Planner internally authorizes an executable PlanRecord, the Web UI SHALL
project one global Plan output in Chat before the live TODO. It SHALL derive the
output deterministically from the persisted PlanRecord without another model
call and SHALL keep it collapsed by default.

#### Scenario: Plan is authorized
- **WHEN** a Plan enters `approved` with executable items
- **THEN** Chat shows a collapsed `执行计划 · 已就绪` disclosure before TODO, and execution does not start before that projection is published

#### Scenario: User expands the Plan
- **WHEN** the user opens the Plan disclosure
- **THEN** it shows the goal, committed user constraints, selected approach summaries, change scope or side effects, ordered execution steps, and verification approach

#### Scenario: Plan is collapsed
- **WHEN** the disclosure has not been opened or the Session projection is restored
- **THEN** only its title and current Plan status consume conversation space; PlanExecutionStep count is not presented as TODO count

#### Scenario: Internal details exist
- **WHEN** the persisted Plan contains candidate alternatives, internal IDs, revision, digest, grants, evidence, control tools, or private reasoning
- **THEN** the global output omits them and does not duplicate raw Plan JSON into UI messages or the model transcript

#### Scenario: Plan is replanned
- **WHEN** a material conflict derives a new revision
- **THEN** Chat keeps the last authorized output while replanning and atomically replaces the same output after the new revision is authorized, without appending a duplicate

### Requirement: Current task state is visible as an inline TODO
When Main maintains TaskState for the current request, the Web UI SHALL show one
inline TODO list immediately after any global Plan output and SHALL update it
from the persisted `TaskState.todoList`. The Web UI MUST NOT derive TODO from
PlanExecutionStep, verification, Tool, AgentProcess, or continuation state.

#### Scenario: Planner authorizes execution with TaskState
- **WHEN** the Plan enters `approved` or `executing` and Main initializes TaskState
- **THEN** Chat inserts `计划已生成`, projects the collapsed global Plan output, and then shows each TodoItem's outcome title and current pending, in-progress, completed, blocked, or skipped state

#### Scenario: Direct execution creates TaskState
- **WHEN** autonomous routing selects Direct and Main creates a multi-item TaskState
- **THEN** Chat shows TODO without requiring or fabricating a global Plan output

#### Scenario: Main advances task state
- **WHEN** Main commits a newer TaskState version
- **THEN** Chat updates the existing TODO list without exposing context mutation calls, raw Plan JSON, verification, evidence, revision, digest, or runtime counters

#### Scenario: Main corrects an invalid verification command
- **WHEN** Host rejects an aggregated Bash verification command as a retryable `invalid_command`
- **THEN** Chat removes that internal correction Tool row after classification while preserving real Bash failures and Plan scope conflicts, and the current TodoItem remains in progress

#### Scenario: Execution messages accumulate
- **WHEN** Thinking, Tool, or assistant messages are appended after Plan authorization
- **THEN** Chat keeps exactly one global Plan output followed by one live TODO after the latest message instead of leaving execution state behind at the original Plan marker

#### Scenario: Execution finishes or the Session reconnects
- **WHEN** the task reaches a terminal state or the client restores the owning Session
- **THEN** Chat restores the latest authorized global Plan output when one exists and independently restores the final TaskState TODO

#### Scenario: Terminal transition clears execution authorization
- **WHEN** a cancelled or failed Plan no longer contains its approval
- **THEN** Chat retains the same Plan's last authorized public output and renders TODO statuses from the independent TaskState snapshot

#### Scenario: Execution requires replanning
- **WHEN** a material conflict derives a revision from the current Plan
- **THEN** Chat retains the last authorized Plan output and current TODO, labels execution `正在调整执行计划`, replaces only the Plan after the new revision is authorized, updates the result marker to `执行计划已更新`, and changes TODO only when Main commits a TaskState mutation

#### Scenario: Runtime stops automatic continuation
- **WHEN** Host exhausts the automatic continuation budget
- **THEN** Chat retains the current in-progress TodoItem and reports that automatic execution stopped; it does not label the item blocked unless TaskState contains a structured external blocker

#### Scenario: Blocker is visible
- **WHEN** TaskState contains a blocked TodoItem
- **THEN** Chat shows its public reason and recovery action without exposing internal errors, paths, counters, or evidence IDs

### Requirement: User intent alignment is native to Chat
The Web UI SHALL render a pending user-value decision as an inline Chat
interaction. It SHALL contain one concise question, exactly one recommended option,
at most three user-understandable options, and a free-form adjustment path.

#### Scenario: Creative direction is underspecified
- **WHEN** a request such as “创建一个俄罗斯方块小游戏” does not determine the visual style
- **THEN** Host persists a pending `visual_direction` alignment requirement and the first user decision asks for that direction in Chat before any implementation side effect

#### Scenario: Alignment options are shown
- **WHEN** a persisted user-value decision is projected into Chat
- **THEN** one option is visibly labeled as recommended and selected initially

#### Scenario: User selects a suggested direction
- **WHEN** the user chooses an inline option
- **THEN** the client sends the typed interaction identity and selected value, the selection becomes an explicit constraint, Chat records the committed choice as a deduplicated user entry without adding it to the model transcript, and the Agent resumes autonomously

#### Scenario: User provides a custom direction
- **WHEN** none of the suggested options matches the user's intent
- **THEN** the user can enter a concise custom constraint without leaving Chat

#### Scenario: Several value requirements are unresolved
- **WHEN** the Plan contains multiple pending alignment requirements
- **THEN** Chat presents and consumes one persisted requirement at a time, and neither compilation nor execution starts while another remains pending

### Requirement: Completed Plan produces one visible final report
The Web Chat SHALL hide execution-phase assistant narration and SHALL show one
final assistant report after a completed Plan. The report SHALL identify
delivered results, verification actually run and its conclusions, and anything
unverified or still missing.

#### Scenario: Execution narration is produced
- **WHEN** Main emits intermediate prose while automatic Plan execution is active
- **THEN** Web omits that prose from live rendering and Session replay while preserving visible Tool results allowed by the normal projection

#### Scenario: Plan completes
- **WHEN** Host enters report phase after terminal cleanup
- **THEN** Web shows the final report once, after TaskState reflects the outcomes actually delivered

#### Scenario: Report has a gap
- **WHEN** verification was not run or an outcome remains incomplete
- **THEN** Web displays that fact in the final report and does not present it as passed

### Requirement: Agent owns technical planning decisions
The UI SHALL NOT ask the user to choose between implementation techniques,
investigation strategies, backtracking points, or replanning mechanics unless
the choice changes a user-visible outcome or an explicit product constraint.

#### Scenario: Technical candidates are equivalent to the user
- **WHEN** multiple feasible implementation paths preserve the same visible behavior and constraints
- **THEN** the Agent selects the best-supported path without requesting a user decision

#### Scenario: A trade-off changes the product outcome
- **WHEN** candidate paths imply different visible behavior, scope, compatibility, cost, or reversibility that cannot be inferred
- **THEN** the Agent asks one Chat-native alignment question framed in user terms

### Requirement: Chat remains responsive while alignment is pending
The UI SHALL use the existing Chat pending/streaming treatment and SHALL NOT
show a standalone “正在准备规划” screen. A pending alignment SHALL be the first
actionable output, and no side-effect tool may run before it is resolved.

#### Scenario: Alignment generation takes time
- **WHEN** the Agent is determining whether user input is required
- **THEN** Chat shows its normal lightweight activity state and keeps Stop available without mounting a Plan module

#### Scenario: Foreground ownership transfers to Planner
- **WHEN** Main finishes its routing turn while a foreground Planner is still generating the alignment
- **THEN** Chat shows `Waiting...` as soon as the Plan route is known, inserts an `进入 Planning Mode` timeline marker when Planner starts, keeps the lightweight processing state visible, and does not expose Planner tools or restore an idle composer

#### Scenario: Alignment is pending
- **WHEN** the server publishes a persisted alignment interaction
- **THEN** the inline controls remain reachable above the composer on desktop, mobile, and `1080x322`, while the main composer remains non-submittable until Planner ownership ends

### Requirement: Disconnected Chat submissions are lossless
The Web composer SHALL only enter processing and clear its draft after the
command is accepted by an open WebSocket.

#### Scenario: User attempts to submit while reconnecting
- **WHEN** the WebSocket is not open
- **THEN** the composer and Send control are disabled, any existing draft is retained, and Chat does not enter processing

#### Scenario: Connection is restored
- **WHEN** the WebSocket opens and the user submits
- **THEN** the command is sent before the draft is cleared and Chat enters its normal processing state

#### Scenario: Alignment command cannot be sent
- **WHEN** the user submits an intent alignment while the WebSocket cannot accept the command
- **THEN** the interaction remains actionable, does not enter a permanent busy state, and can be submitted again after reconnection

### Requirement: Existing permission UI remains the authorization boundary
The Web UI SHALL NOT request approval for an entire Plan. Filesystem,
process, network, and external-write authorization SHALL continue through the
existing permission interaction when required by Harness policy.

#### Scenario: Internal Plan contains a side effect
- **WHEN** an execution step reaches a protected side-effect tool
- **THEN** the existing permission prompt is shown without a preceding Plan approval panel

#### Scenario: Internal Plan changes
- **WHEN** new evidence causes replanning
- **THEN** the Agent updates its internal path and only returns to Chat alignment if a new user-value decision is required

### Requirement: Chat alignment remains separate from hidden reasoning
The persisted interaction identity and selected constraint SHALL remain typed
and recoverable, while hidden prompts, Chain-of-Thought, technical candidate
trees, and raw Plan state SHALL NOT be inserted into the model transcript.

#### Scenario: Session reconnects with pending alignment
- **WHEN** the Web client reconnects or switches back to the owning Session
- **THEN** the same inline alignment interaction is restored once without synthetic assistant reasoning

#### Scenario: Theme or viewport changes
- **WHEN** Chat alignment is displayed in light or dark theme at supported desktop and mobile sizes
- **THEN** it uses existing `--color-*` tokens, remains keyboard accessible, and introduces no horizontal clipping or inaccessible nested scrolling
