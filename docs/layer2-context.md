# Layer 2: Context Management

## 职责

- 追踪对话的 token 预算消耗
- 在每次 LLM 调用前通过 `transformContext` hook 确保消息不超窗口
- 提供多种压缩策略（丢弃、滑动窗口、LLM 摘要）
- 处理 overflow 异常并恢复

## 核心类型

```typescript
interface TokenBudget {
  contextWindow: number;            // model.contextWindow (e.g. 128000)
  reservedForOutput: number;        // model.maxTokens (e.g. 8192)
  reservedForSystem: number;        // system prompt 估算 token 数
  reservedForTools: number;         // tool definitions 估算 token 数
  availableForMessages: number;     // contextWindow - output - system - tools
}

type CompactionStrategy = "drop-oldest" | "sliding-window" | "summarize-prefix";

interface ContextManagerConfig {
  strategy: CompactionStrategy;
  targetUtilization: number;        // 默认 0.85 (85% 时触发压缩)
  minRetainedMessages: number;      // 最少保留消息数（默认 4: 2 轮对话）
  summaryModel?: Model<any>;        // summarize-prefix 策略用的模型
  summaryMaxTokens?: number;        // 摘要最大长度（默认 500）
}
```

## ContextManager

```typescript
class ContextManager {
  private config: ContextManagerConfig;
  private tokenEstimator: TokenEstimator;
  private actualUsageHistory: number[];  // 运行时校准用

  constructor(config: ContextManagerConfig);

  /**
   * transformContext hook 实现。
   * 每次 LLM 调用前由 pi-agent-core 自动调用。
   */
  async transform(messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> {
    const budget = this.getTokenBudget(currentModel, systemPrompt, tools);
    const estimated = this.tokenEstimator.estimate(messages);

    if (estimated <= budget.availableForMessages * this.config.targetUtilization) {
      return messages; // 无需压缩
    }

    return this.compact(messages, budget, signal);
  }

  getTokenBudget(model: Model<any>, systemPrompt: string, tools: AgentTool[]): TokenBudget;
  estimateTokens(messages: AgentMessage[]): number;
}
```

## Token 估算器

```typescript
class TokenEstimator {
  private calibrationFactor: number = 1.0;

  /**
   * 启发式估算（无本地 tokenizer）
   * - 英文/代码: chars / 3.5
   * - CJK 为主: chars / 2.5
   * - 混合: 按比例加权
   */
  estimate(messages: AgentMessage[]): number;
  estimateText(text: string): number;

  /**
   * 用实际 usage.input 校准比率
   * actualTokens / estimatedTokens → 更新 calibrationFactor
   */
  calibrate(estimated: number, actual: number): void;
}
```

### CJK 检测逻辑

```typescript
function cjkRatio(text: string): number {
  const cjk = text.match(/[一-鿿぀-ゟ゠-ヿ가-힯]/g);
  return cjk ? cjk.length / text.length : 0;
}

function estimateTokens(text: string): number {
  const ratio = cjkRatio(text);
  const divisor = 3.5 * (1 - ratio) + 2.5 * ratio; // 加权
  return Math.ceil(text.length / divisor);
}
```

## 压缩策略

### drop-oldest

最简单，零成本：

```typescript
function dropOldest(messages: AgentMessage[], budget: number, estimator: TokenEstimator): AgentMessage[] {
  // 从头部开始丢弃 user+assistant 对，直到 estimatedTokens <= budget
  // 保留 minRetainedMessages 条
  // 注意: 不拆开 tool_call + tool_result 对
}
```

### sliding-window

保留最近 K 轮：

```typescript
function slidingWindow(messages: AgentMessage[], maxTurns: number): AgentMessage[] {
  // 一个 "turn" = user message + assistant message + tool results
  // 从尾部数 maxTurns 轮，丢弃之前的
}
```

### summarize-prefix

用 LLM 摘要前面的消息，替换为一条合成消息：

```typescript
async function summarizePrefix(
  messages: AgentMessage[],
  budget: number,
  summaryModel: Model<any>,
  signal?: AbortSignal
): Promise<AgentMessage[]> {
  // 1. 将前 N 条消息（要被丢弃的）序列化为文本
  // 2. 调用 summaryModel: "请用一段话总结以下对话的关键信息..."
  // 3. 生成合成 user message: "[Context Summary]\n{summary}"
  // 4. 返回 [synthetic_summary, ...remaining_messages]
}
```

## Overflow 恢复

当 LLM 返回 overflow 错误时（通过 `isContextOverflow()` 检测）：

```typescript
agent.subscribe((event) => {
  if (event.type === "message_end") {
    if (isContextOverflow(event.message, model.contextWindow)) {
      // 1. 强制执行更激进的压缩
      contextManager.forceCompact();
      // 2. 重试
      agent.continue();
    }
  }
});
```

## 运行时校准

每次收到 `AssistantMessage.usage` 时：

```typescript
agent.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "usage") {
    const actualInput = event.assistantMessageEvent.usage.input;
    const estimated = contextManager.lastEstimate;
    contextManager.tokenEstimator.calibrate(estimated, actualInput);
  }
});
```

随着对话进行，估算精度逐渐提高。

## 与其他层的交互

| 层 | 交互方式 |
|----|----------|
| Layer 0 | 作为 `transformContext` hook 注入 Agent |
| Layer 1 | 压缩后的 `compactedPrefix` 存入 Session |
| Layer 3 | Memory 注入增加 system prompt 长度，需要预留 budget |
| Layer 4 | Skill 工具定义占用 budget，需要动态计算 `reservedForTools` |

## 配置示例

```json
{
  "context": {
    "strategy": "summarize-prefix",
    "targetUtilization": 0.85,
    "minRetainedMessages": 6,
    "summaryModel": { "provider": "deepseek", "modelId": "deepseek-v4-flash" }
  }
}
```
