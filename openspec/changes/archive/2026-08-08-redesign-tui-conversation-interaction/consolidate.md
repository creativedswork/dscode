## 变更综述

dscode 的 Tool 与 SubAgent 展示最初通过统一 formatter 和 shared UI model 解决
Live/History、Web/TUI 的基础漂移，随后演进为可恢复的 Agent Activity Card 和
`Turn → Execution → Tool` 层级。本次变更进一步把交互与数据模型统一起来：TUI
改为消费 canonical conversation snapshot，以单一 `Ctrl+E` Activity Inspector
承载稳定 selection、完整 Tool output 和 owner-bound Permission，使 Chat 保持紧凑的
同时不再丢失执行细节。

## 变更时间线

- 2025-07-14: `unify-tool-result-formatting` — 统一 Live/History Tool result 摘要格式化入口。
- 2025-07-14: `format-tool-results-in-ui` — 为 Tool result 增加内容感知格式和 Markdown 展示。
- 2026-05-29: `shared-ui-data-model` — 建立 Web/TUI 共用的 UI 类型和 reducer 方向。
- 2026-08-04: `show-subagents-in-conversation` — 将 Agent Process 生命周期投影为可恢复的对话 Activity。
- 2026-08-07: `tui-execution-hierarchy-redesign` — 建立 `Turn → Execution → Tool` 层级和 Tool/Permission 归属。
- 2026-08-07: `redesign-tui-conversation-interaction` — 用 canonical state 和 Activity Inspector 完成交互收敛。

## 初始设计

早期 Tool result 的核心问题是 Live 与 History 各自截断和格式化，导致修复无法同时覆盖
实时与重放路径。`unify-tool-result-formatting` 引入 shared formatter，将结果压缩为适合
ToolCard 的展示文本；`format-tool-results-in-ui` 在此基础上补充 JSON、代码块和 Markdown
语义。这一阶段解决了展示一致性，但 formatter 输出仍被当作唯一结果，完整数据没有独立的
UI projection。

`shared-ui-data-model` 随后提出 `src/ui/shared/`、canonical `UIMessage[]` 和 pure reducer，
目标是消除 Web/TUI 类型与状态机重复。Web 率先采用 reducer，TUI 仍保留
`thinkingBuffer`、`toolEntries` 和 replay 分支，因此 shared model 尚未成为真正的单一事实
来源。

## 变更记录

### 变更: 将 Agent Process 投影到对话
- **触发**: SubAgent 已独立运行并持久化，但用户只能看到短暂通知，无法理解状态和结果。
- **改动**: 按 `agentId` 将 spawn、progress、output 和 exit 合并为 Agent Activity，并从
  Session `agentMessages` 恢复历史 Card。
- **影响**: Web/TUI 可以展示同一个 SubAgent 执行记录，同时保持 Main transcript 与
  SubAgent transcript 隔离。

### 变更: 建立 Execution 与 Tool 层级
- **触发**: Main Tool、`spawn_agent`、SubAgent Tool、Permission 和 Waiting 仍以扁平日志
  堆叠，存在重复和归属歧义。
- **改动**: 引入 execution/tool identity，将 Tool timeline、Permission 和 result 收进
  owner Execution；成功的 `spawn_agent` 由 Agent Card 唯一表示。
- **影响**: TUI 获得 `Turn → Execution → Tool` 信息架构，但 disclosure 仍依赖
  `Ctrl+R/O/N` 和第二套 mutable state。

### 变更: 收敛 canonical conversation 与 result projection
- **触发**: Web reducer、TUI live buffer、TUI replay 各自匹配 Tool，平行同名 Tool 会碰撞，
  formatter 截断后的文本也无法恢复。
- **改动**: Main/SubAgent Tool 统一使用 `toolCallId`；Harness event adapter、TUI 和 Web
  共享 reducer transition；结果拆分为 compact summary 与 lossless inline text/ref。
- **影响**: Live、History、Main Tool 和 SubAgent Tool 使用相同 identity/result 语义；
  大结果按需从 Session transcript 或 Agent Process snapshot 解析。

### 变更: 用 Activity Inspector 替代全局 disclosure
- **触发**: 动态 Activity 更新时，全局快捷键无法明确表达操作目标，selection 和 focus
  也不可见。
- **改动**: 新增 pi-tui capturing overlay，使用稳定 Activity ID、自动选择优先级、
  Tab 导航、Enter activate 和固定 12 行 output viewport；移除 `Ctrl+R/O/N` disclosure。
- **影响**: Chat 只负责摘要，Inspector 负责执行细节；用户 selection 和 disclosure 不会
  被 streaming progress 抢占。

## 修复记录

### 修复: 同名 Tool 更新碰撞
- **症状**: 并行的同名 Tool 可能被名称匹配合并，结果落到错误行。
- **根因**: TUI live/history 路径缺少强制 `toolCallId` identity。
- **修复**: reducer、history reconstruction 和 Agent projector 均按 Tool identity upsert，
  legacy 记录只展示可证明数据，不伪造缺失 ID。

### 修复: Tool result 被永久截断
- **症状**: Main Tool 经过 formatter 后只剩有限字符，SubAgent Tool 更只有状态摘要，
  Inspector 无法查看完整输出。
- **根因**: 展示摘要与权威结果共用同一字段，且没有 Session/Agent Process 引用协议。
- **修复**: 引入 `ToolResultProjection`；summary 保持紧凑，完整 text 内联或通过 ref 懒解析，
  viewport 的行数限制不再修改源数据。

### 修复: Permission 输入与 owner/focus 脱节
- **症状**: Permission 虽显示在 Agent Card 内，输入仍由应用级全局状态处理，解决后焦点
  恢复不确定。
- **根因**: Permission 没有独立 capturing component，也没有保存前一 focus owner。
- **修复**: 使用 owner-bound `TuiPermissionInput` 和最高输入优先级，直接处理 `1-4`、Enter、
  `D`，完成后恢复 Inspector selection 或 Editor focus。

### 修复: 大段用户输入挤满 Chat
- **症状**: large paste 虽被 Editor 识别，提交后仍把 20 余行全文渲染到 Chat，遮蔽
  streaming Thinking 和当前 Activity。
- **根因**: 长文本摘要仅用于自定义命令 echo，普通提交与 Session replay 都直接渲染
  canonical user content。
- **修复**: 将用户消息预算下沉到 `ConversationView` 投影层；超过 1000 字符或 10 行时
  只显示首行、字符数和行数，canonical message、模型输入和 Session 继续保留全文。

### 修复: Activity 状态迁移破坏 disclosure
- **症状**: running Agent 默认折叠，Permission owner 可被手动收起，selected Tool 在
  running → completed 后可能消失。
- **根因**: Chat 与 Inspector 共用不完整的默认展开规则，并在 snapshot 更新时覆盖手动状态。
- **修复**: Chat 按 active/completed 状态决定默认值；Inspector 分离默认与手动 disclosure，
  Permission 强制展开但不覆盖手动选择，selected Tool 在状态迁移期间保持可见。

### 修复: 重复生命周期与空结果状态错误
- **症状**: duplicate assistant start 会创建空 streaming message，重复 processing 会叠加
  loader，空字符串 Tool result 会永久显示 running。
- **根因**: start/processing transition 非幂等，Tool 完成判断只依赖非空 result text。
- **修复**: Pi `agent_start` 成为唯一 streaming start；reducer 与 processing transition
  幂等；`resultDetail` 存在即作为 Tool 已结束证据。

### 修复: 历史 Agent 结果与 attachment 漂移
- **症状**: 重启后 Inspector 无法解析 Agent Process result ref，background Agent 被重放为
  foreground。
- **根因**: Session 未持久化 attachment，历史 replay 只查询 live supervisor snapshot。
- **修复**: Session 持久化 attachment 和 Tool timeline；replay 预加载 Process Store
  snapshot，并按 live、stored runtime、historical cache 的顺序解析 result ref。

### 修复: Main Tool 多行摘要重新撑满 Chat
- **症状**: formatter 的 Markdown code block 被直接拼进 Tool 行，80 行结果在 Chat
  展开为多行。
- **根因**: “摘要”字段仍允许换行，Chat 没有独立的单行结果预算。
- **修复**: 多行或大结果只显示 `lineCount · charCount`，短结果归一化换行与连续空白；
  完整正文只在 Inspector output viewport 展示。

### 修复: 中英混合 Thinking 触发 TUI 异常退出
- **症状**: 包含 `小红书` 等全角字符的 Thinking 在宽终端超出 1-3 列，pi-tui 抛出
  `Rendered line exceeds terminal width`，fatal handler 随后退出进程。
- **根因**: collapsed Thinking 按 JavaScript string length 截断，但终端按 visible width
  验收；CJK 字符占两列。
- **修复**: 使用 `truncateToWidth` 按终端列宽截断，并加入 213 列中英混合回归测试。

### 修复: Kitty Ctrl+E press/release 双重 toggle
- **症状**: Inspector 打开后立即闪退。
- **根因**: 全局 input listener 在 pi-tui 过滤 release 之前执行，Kitty release 再次命中
  `Ctrl+E` toggle。
- **修复**: 应用级 listener 先消费 `isKeyRelease()`；Inspector 只响应 press。

### 修复: Processing 期间 Editor 与 tips 状态不一致
- **症状**: Turn 运行时 ↑/↓ 仍恢复历史 prompt，tips 同时提示不可提交的 `exit`、`/help`。
- **根因**: `disableSubmit` 只禁止 Enter，其他 Editor 输入仍继续分发。
- **修复**: processing 期间只保留 `Ctrl+E`、Esc/Tab/Ctrl+C 等 Inspector/abort 操作，
  其余输入由应用消费；tips 仅展示这些真实可用快捷键。

### 修复: Tool output 无法逐行浏览且 Esc 跳过 Activity 列表
- **症状**: 长 Skill result 中 ↑/↓ 不改变行范围，Esc 从 output 直接关闭 Inspector。
- **根因**: output handler 只实现分页键；应用级 input listener 在 overlay 之前消费 Esc。
- **修复**: 增加 ↑/↓、J/K 逐行浏览；overlay 打开时应用层将导航键交给 Inspector，
  output 中 Esc/Left 返回 Activity 列表，列表中的 Esc 才关闭 Inspector。

## 最终状态

TUI 现在以 canonical `UIMessage[]` 为 conversation 单一事实来源。Harness lifecycle 先由
shared adapter 转换为 conversation event，再由 pure reducer 按 messageId、toolCallId 和
agentId 更新；Web 和 TUI 消费相同 transition，Session replay 也重建同结构 snapshot。

`Ctrl+E` 打开 Activity Inspector，并按 Permission Tool、running Tool、running Agent、
streaming Thinking、最近 Activity 的顺序选择当前项。Inspector 使用
`thinking:<messageId>`、`main-tool:<toolCallId>`、`agent:<agentId>` 和
`agent-tool:<agentId>:<toolCallId>` 保存稳定 selection/disclosure。Tab/Shift+Tab 导航，
Enter/右方向键 activate，左方向键返回或折叠，`Ctrl+E`/Esc 关闭并恢复 Editor。

Main/SubAgent Tool result 均提供 compact summary 和 lossless detail。短结果内联，长结果
引用 Session 或 Agent Process；output viewport 以 12 行为一页支持 ↑/↓、J/K、
PgUp/PgDn、Home/End，并以 Esc/Left 返回 Activity 列表，不再把视觉预算写回 canonical
数据。Completed Execution 默认折叠，活动或 Permission Execution 默认展开，Chat 中
多行或大 Tool result 只保留单行行数/字符数摘要。

Permission 继续由 Harness 队列串行化，但 TUI 输入绑定所属 Tool。界面显示
`Researcher > bash` 或 `Main > bash`，支持 `1-4`、Enter 和 `D`，Allow once 直接完成，
不会追加永久 Permission 消息。旧 Session 缺少 identity/detail 时保持可用，但系统不会
虚构不存在的结果。

Chat 对超过 1000 字符或 10 行的用户输入使用首行摘要，并显示原始字符数和行数。该预算
仅属于 TUI projection，live 与 Session replay 行为一致，不会改写 canonical user content
或发送给模型的完整 prompt。

实现已通过全量单元测试、TypeScript、production/Web build、严格 OpenSpec 校验，并使用
`tuistory@0.10.1` 在 120×36、80×24 真实 PTY 中运行
`node ./dist/dscode.mjs --cwd /Users/bytedanceo/Workspace/DeepSeekSpace/html-canvas`，
验证 Inspector 开关、草稿保持和 Editor focus。确定性 PTY 进一步验证了 21 行
large-paste、running Agent disclosure、80 行 Main Tool output 分页、
`Researcher > bash` Permission 数字键 `1` 以及焦点恢复。交互 workbench 判定为
`archive`，归档时应移动到
`docs/prototypes/archive/2026-08-07-redesign-tui-conversation-interaction/`。
