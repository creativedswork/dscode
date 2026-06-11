## Why

当前 `/eval` 命令采用「规则引擎预处理 + LLM one-shot 分析」的混合架构：规则引擎做元数据提取、tool stats、regex Phase 划分和 Jaccard 关键词偏离检测，LLM 拿到压缩后的 session abstract 做一次性的 Phase 划分+偏离检测+根因推断。这套架构存在三个根本缺陷：

1. **扁平化分析，缺乏因果结构**：LLM 一次性"看完整条日志"直接出结论，没有构建 agent 执行过程中的因果图（谁产生什么数据、谁消费了什么数据、哪一步的决策导致了后续失败）。这使根因推断停留在"猜"而非"追溯"——CHIFF 论文已证明结构化因果图+反事实归因比 flat prompt 准确率高 15-30 个百分点。
2. **dscode session 日志天然适合因果建模**：dscode 的 session JSON 包含 thinking、toolCall（含 args/result）、thinking+tool 交替序列，本质上是 ReAct 轨迹。这比 CHIFF 原论文处理的 Magnetic-One/CaptainAgent 日志更结构化（我们不需要 LLM 猜 agent 身份——tool name 就是 agent-action identity），但当前 `/eval` 完全没有利用这些结构。
3. **规则引擎硬编码 pattern，无法发现未知失败模式**：Jaccard 关键词偏离只能检测视觉描述偏离，root cause 推理只支持「效果过载」和「感知盲区」两种固定模式。6 步 agentic 流水线可能产生数十种失败模式（循环决策错误、数据误传递、不可逆操作、scope creep 等），规则引擎完全无法覆盖。

此次变更基于 CHIFF（From Flat Logs to Causal Graphs，2026）的方法论和参考实现，以及 CHIEF-ReAct 实现规格书，将 `/eval` 从「规则+一次 LLM」重构为「受约束因果图分析引擎」。

## What Changes

- **重写 `src/eval/` 模块**：从当前的 rules-engine + one-shot-LLM 架构替换为 CHIFF 因果图分析架构
  - 新增 `src/eval/graph-store.ts`：因果图存储与确定性图操作（拓扑序、前驱查询、数据流路径、循环组）
  - 新增 `src/eval/schemas.ts`：所有数据结构的 TypeScript 类型定义（Subtask、OTAR、AgentNode、CausalEdge、CandidateSet、Attribution 等）
  - 新增 `src/eval/prompts.ts`：各步骤的 LLM prompt 模板（Step1-4 建图 + Step5 候选集 + Step6 反事实裁决）
  - 重写 `src/eval/analyzer.ts`：从规则引擎替换为 6 步因果分析流水线（分解→边→OTAR→Agent边→候选集→根因裁决）
  - 重写 `src/eval/llm.ts`：从 one-shot 调用替换为多步 LLM chain（支持 structured output 和 function calling）
  - 保留并适配 `src/eval/dashboard.ts`：Dashboard 生成器适配新的 EvalResult 结构（显示因果图、数据流路径、反事实推理链）
  - 重写 `src/eval/index.ts`：编排入口适配新流水线
  - 重写 `src/eval/types.ts`：类型定义对齐 CHIFF 因果图模型
- **Session 分析视角升级**：从"统计+偏离报告"升级为"因果图+反事实根因归因"
- `/eval` slash command 行为不变（参数、输出位置），但输出内容升级为因果诊断报告

## Capabilities

### New Capabilities

- `eval-causal-graph`: 基于 CHIFF 方法论的 session 因果图分析引擎，包括 Step1-4 因果图构建（子任务分解→子任务边→Agent 节点 OTAR→Agent 边）、Step5 候选错误集生成、Step6 反事实根因裁决、因果图可视化展示
- `eval-graph-store`: 确定性因果图存储与查询，包括子任务拓扑序、数据流路径追溯、循环组识别、前驱节点查询——所有图操作代码化（非 LLM），消除幻觉

### Modified Capabilities

- `eval-dashboard`: Dashboard 展示从「统计卡片+Phase 时间线+根因列表」升级为「因果图可视化+数据流路径+反事实推理链+根因裁决」，新增因果图 SVG 渲染和 Rule1/2/3 推理展示
- `session-management`: SessionStore 的 `loadSessionFile` 方法不变，但 eval 消费端改为从 session 消息中解析结构化的 `HistoryStep[]`（含 agent 身份、OTAR 四元组），而非直接传给 LLM raw text

## Impact

- **新增文件**: `src/eval/schemas.ts`（约 150 行）、`src/eval/graph-store.ts`（约 250 行）、`src/eval/prompts.ts`（约 200 行）
- **重写文件**: `src/eval/analyzer.ts`（约 350 行）、`src/eval/llm.ts`（约 200 行）、`src/eval/types.ts`（约 120 行）、`src/eval/index.ts`（约 120 行）
- **适配文件**: `src/eval/dashboard.ts`（约 150 行改动）、`src/ui/commands.ts`（约 5 行改动——仅 LLM 调用接口名更新）
- **不影响的系统**: Skills、MCP、Permission、Agent/Harness 核心逻辑、TUI 渲染、Web UI
- **依赖**: Node.js 内置模块（fs, path, os, child_process），复用 dscode 现有的 `completeSimple` 或 harness LLM 调用能力
- **LLM 调用次数变化**: 从 1 次 one-shot 变为 4-6 次串行调用（Step1-4 建图 + Step5 候选 + Step6 裁决），单次分析成本约 $0.03-0.08（取决于模型），延迟增加至 20-40 秒
- **降级策略**: LLM 调用失败时回退为规则引擎（保留现有 analyzer.ts 核心逻辑作为 fallback），标注「规则引擎降级分析」
