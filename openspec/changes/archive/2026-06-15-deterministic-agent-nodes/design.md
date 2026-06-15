## Context

当前 CHIFF 管线的 Step 3 (`executeStep3`) 调用 LLM 同时输出 agent nodes 和 data flows。Agent nodes 是 OTAR 格式（Observation/Thought/Action/Result），其所有信息已在 `parseSessionToSteps()` 返回的 `HistoryStep[]` 中确定性地存在——LLM 仅做数据搬移。

`HistoryStep` 结构（来自 `src/eval/schemas.ts`）：
```ts
{ stepId, agent, observation, thought, action, result, messageIdx, isError, timestamp }
```

`AgentNode` 结构（来自 `src/eval/schemas.ts`）：
```ts
{ subtaskId, agent, otar: { observation, thought, action, result }, stepIds: number[] }
```

Step 1 (`executeStep1`) 已将 session 分解为 `Subtask[]`，每个 subtask 包含 `stepStart`/`stepEnd`，精确覆盖所有 steps。

## Goals / Non-Goals

**Goals:**
- Agent nodes 完全确定性构建，不依赖 LLM，不会失败
- `executeStep3` 签名不变（仍返回 `{ agents, dataFlows }`），不破坏调用方
- Data flows 保留 LLM，prompt 缩小（只传 subtask 级摘要），降低截断概率

**Non-Goals:**
- 不修改 `AgentNode` 或 `StepDataFlow` 类型定义
- 不修改 graph-store、dashboard、focus pipeline
- 不改变 Step 1/2/4/5/6 的逻辑
- 不追求 data flows 的完全确定性（这需要语义理解，LLM 是正确的选择）

## Decisions

### Decision 1: Agent nodes — 确定性构建

`buildAgentNodes(steps, subtasks)` 纯函数：

```
for each subtask in subtasks:
  for each stepId in [subtask.stepStart .. subtask.stepEnd]:
    step = steps[stepId]
    agentNode = {
      subtaskId: subtask.id,
      agent: step.agent,
      otar: {
        observation: step.observation,
        thought: step.thought,
        action: step.action,
        result: step.result
      },
      stepIds: [stepId]
    }
```

**Rationale**: `HistoryStep` 已有完整的 OTAR 信息。Subtask 的 step range 已由 Step 1 的 LLM 确定。构建过程是纯数据映射，零 LLM 调用。

**Alternative considered**: 保留 LLM 做 OTAR 但加 JSON mode → pi-ai 不支持，且根本没有必要——确定性数据不应该用概率系统处理。

### Decision 2: Data flows — 保留 LLM，缩小 prompt

Step 3 的 prompt 改为只输出 `dataFlows`，移除 `agents` 部分：

```
OUTPUT (pure JSON):
{
  "dataFlows": [
    {
      "subtaskId": "S1",
      "fromStep": 0,
      "toStep": 3,
      ...
    }
  ]
}
```

Prompt 中不再需要完整的 history summary——改为传 subtask 级摘要（每个 subtask 的 step range + 关键 tool 列表），大幅缩小 token 消耗。

**Rationale**: Data flows 需要语义理解（"这个 write_file 写入的数据是否在后续被正确地 read 了"），LLM 是正确选择。但缩小 prompt 可以降低截断风险。

### Decision 3: `executeStep3` 签名不变

```ts
async function executeStep3(
  subtasks: Subtask[],
  steps: HistoryStep[],
  harness: HarnessAPI,
): Promise<{ agents: AgentNode[]; dataFlows: StepDataFlow[] }>
```

内部改为：
```ts
const agents = buildAgentNodes(steps, subtasks);
const dataFlows = await fetchDataFlows(subtasks, steps, harness);
return { agents, dataFlows };
```

**Rationale**: 调用方 (`runCausalGraphPipeline`) 不改，接口不变，纯粹的实现替换。

## Risks / Trade-offs

- **[Data flows prompt 缩小后输出质量]**: 传的 step 信息少了可能影响 data flow 准确性 → Mitigation: subtask 摘要里保留 step range + 每个 step 的 agent/action/file 列表，足够推断数据流
- **[Agent nodes 不再经 LLM 润色]**: 之前 LLM 可能对 observation/thought 做摘要，现在直接取原文 → 这是正确的行为——原文是最好的，LLM 摘要反而可能引入错误
