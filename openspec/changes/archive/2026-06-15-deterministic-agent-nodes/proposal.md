## Why

CHIFF 管线的 Step 3 用 LLM 从 session history 中提取 OTAR（Observation/Thought/Action/Result）agent 节点，但 OTAR 的全部信息已经在 `parseSessionToSteps` 返回的 `HistoryStep` 中确定性存在。让 LLM 做"数据搬移"既浪费 token，又引入不必要的解析失败风险——session 数据是既定事实，LLM 不应该有失败的可能。

## What Changes

- Step 3 拆分为两部分：
  - **Agent nodes**：从 `HistoryStep[]` 确定性构建，不再调用 LLM，不会失败
  - **Data flows**：保留 LLM，改为逐 subtask 分治调用（divide-and-conquer），每个 subtask 单独 prompt，避免大 session 下 token 截断
- 删除 `buildStep3Prompt` 中的 agent nodes 输出指令，简化为仅输出 data flows；新增 `buildStep3SingleSubtaskPrompt` 用于单 subtask 调用
- 新增 `buildAgentNodes(steps, subtasks)` 函数，纯计算，无副作用
- `executeStep3` 签名不变，内部改为：确定性构建 agent nodes + 循环逐 subtask 调用 LLM + 聚合结果 + 优雅降级（单 subtask 失败不阻塞整体）

## Capabilities

### New Capabilities
- `deterministic-agent-nodes`: 从已解析的 session steps 确定性构建 OTAR agent 节点，消除 Step 3 中不必要的 LLM 依赖

### Modified Capabilities
- `eval-causal-graph`: Step 3 的实现从纯 LLM 驱动改为确定性构建 + LLM 辅助 data flows

## Impact

- **Core Logic**: `src/eval/llm.ts` — `executeStep3()`, 新增 `buildAgentNodes()`
- **Prompts**: `src/eval/prompts.ts` — `buildStep3Prompt()` 简化 + 新增 `buildStep3SingleSubtaskPrompt()`
- **No impact**: `graph-store`（AgentNode 结构不变）、dashboard、focus pipeline
