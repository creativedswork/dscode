## ADDED Requirements

### Requirement: Web keeps planning under Agent control
The Web composer SHALL remain a single Chat input and SHALL NOT expose an
`Auto / Plan` selector, Plan workbench, Plan summary, or separate planning
navigation. Main Agent SHALL decide whether to execute directly, investigate,
or use the internal Planner.

#### Scenario: User submits a sufficiently specified request
- **WHEN** the request contains enough user intent to determine the visible outcome
- **THEN** the Agent proceeds through the existing Chat experience without opening a planning surface

#### Scenario: Agent uses an internal Plan
- **WHEN** complexity routing starts or revises an internal PlanRecord
- **THEN** the Web UI does not expose routing scores, candidates, revision, digest, effect grants, evidence, control tools, or Agent process details

### Requirement: Approved work is visible as an inline TODO
After Planner compiles executable items, the Web UI SHALL show one inline TODO
list in Chat and SHALL update it from persisted PlanItem status.

#### Scenario: Planner authorizes execution
- **WHEN** the Plan contains compiled items and enters `approved` or `executing`
- **THEN** Chat inserts `计划已生成 · N 项任务` after the Planning phase and shows each user-understandable item title and its current pending, in-progress, completed, blocked, or skipped state beneath it

#### Scenario: Main advances execution
- **WHEN** `plan_start_item` or `verify_item` changes persisted PlanItem state
- **THEN** the existing TODO list updates without exposing either control tool call, raw Plan JSON, revision, digest, or an internal verification rejection

#### Scenario: Execution messages accumulate
- **WHEN** Thinking, Tool, or assistant messages are appended after Plan authorization
- **THEN** Chat keeps exactly one live TODO after the latest message instead of leaving the execution state behind at the original Plan marker

#### Scenario: Execution finishes or the Session reconnects
- **WHEN** the Plan reaches a terminal state or the client restores the owning Session
- **THEN** Chat projects the latest persisted Plan and retains the final completed, blocked, failed, skipped, or cancelled TODO state

#### Scenario: Execution requires replanning
- **WHEN** a material conflict derives a revision from the current Plan
- **THEN** Chat retains the TODO list, labels it `正在调整执行计划`, updates the result marker to `执行计划已更新 · N 项任务` after authorization, and does not insert a second `进入 Planning Mode` marker

### Requirement: User intent alignment is native to Chat
The Web UI SHALL render a pending user-value decision as an inline Chat
interaction. It SHALL contain one concise question, an optional recommendation,
at most three user-understandable options, and a free-form adjustment path.

#### Scenario: Creative direction is underspecified
- **WHEN** a request such as “创建一个俄罗斯方块小游戏” does not determine the visual style
- **THEN** the first user decision asks for visual direction in Chat before any implementation side effect

#### Scenario: User selects a suggested direction
- **WHEN** the user chooses an inline option
- **THEN** the client sends the typed interaction identity and selected value, the selection becomes an explicit constraint, Chat records the committed choice as a deduplicated user entry without adding it to the model transcript, and the Agent resumes autonomously

#### Scenario: User provides a custom direction
- **WHEN** none of the suggested options matches the user's intent
- **THEN** the user can enter a concise custom constraint without leaving Chat

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
