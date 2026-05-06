# Layer 0: Agent Loop

> 已由 pi-agent-core + pi-ai 提供，无需自建。本文档记录其 API 表面和我们的消费方式。

## Agent 类 API

```typescript
import { Agent, type AgentTool } from "@mariozechner/pi-agent-core";
import { streamSimple, getModel, Type } from "@mariozechner/pi-ai";
```

### 构造

```typescript
const agent = new Agent({
  initialState: {
    systemPrompt: string,
    model: Model<any>,
    tools: AgentTool<any>[],
    thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
  },
  streamFn: streamSimple,               // pi-ai 的统一流式函数
  transformContext?: (messages, signal) => Promise<AgentMessage[]>,  // Layer 2 注入
  beforeToolCall?: (context, signal) => Promise<{ block, reason } | undefined>,  // Layer 5 注入
  afterToolCall?: (context, signal) => Promise<{ content, isError, terminate } | undefined>,
  sessionId?: string,                    // 用于 prompt caching 亲和
  toolExecution?: "parallel" | "sequential",
});
```

### 驱动对话

```typescript
await agent.prompt("用户消息");          // 触发完整 loop: LLM → tool → LLM → ...
await agent.prompt(agentMessage);        // 传入结构化 AgentMessage
await agent.continue();                  // 继续上一轮（如 overflow 后重试）
agent.steer(message);                    // 中途注入（当前 turn 结束后生效）
agent.followUp(message);                 // agent 停止后追加
agent.abort();                           // 取消当前流
agent.reset();                           // 清空消息历史
```

### 状态访问

```typescript
agent.state.messages;                    // AgentMessage[] (可读写)
agent.state.systemPrompt;               // string (可读写)
agent.state.model;                      // Model<any> (可读写)
agent.state.tools;                      // AgentTool[] (可读写)
agent.state.isStreaming;                // boolean (只读)
agent.state.pendingToolCalls;           // ReadonlySet<string>
```

### 事件订阅

```typescript
const unsub = agent.subscribe((event, signal) => {
  switch (event.type) {
    case "agent_start":                  // agent 开始处理
    case "agent_end":                    // agent 完成，event.messages
    case "turn_start":                   // 一轮 LLM 调用开始
    case "turn_end":                     // 一轮结束，event.message + event.toolResults
    case "message_start":                // assistant message 开始
    case "message_update":               // 流式 delta，event.assistantMessageEvent
    case "message_end":                  // assistant message 完成
    case "tool_execution_start":         // 工具开始，event.toolName + event.args
    case "tool_execution_update":        // 工具部分结果
    case "tool_execution_end":           // 工具完成，event.result + event.isError
  }
});
```

### AssistantMessageEvent 子事件

```typescript
event.assistantMessageEvent.type:
  - "text_start" / "text_delta" / "text_end"
  - "thinking_start" / "thinking_delta" / "thinking_end"
  - "tool_call_start" / "tool_call_delta" / "tool_call_end"
  - "usage"                             // token 用量
```

## AgentTool 定义

```typescript
interface AgentTool<TParameters extends TSchema> {
  name: string;
  label: string;                         // 人类可读标签
  description: string;
  parameters: TParameters;               // TypeBox schema
  executionMode?: "parallel" | "sequential";
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: (partialResult) => void
  ) => Promise<{
    content: (TextContent | ImageContent)[];
    details: any;
    terminate?: boolean;
  }>;
}
```

## 工具执行流程

```
agent.prompt(input)
  │
  ▼
LLM stream → assistant message (可能包含 tool_call)
  │
  ▼ (如有 tool_call)
beforeToolCall(context) → allow/block?
  │ allow
  ▼
tool.execute(id, params, signal) → result
  │
  ▼
afterToolCall(context, result) → 可修改 result
  │
  ▼
tool result 作为新消息 feed back → 再次调用 LLM
  │
  ▼ (直到无 tool_call 或 terminate: true)
agent_end
```

## 我们的消费策略

| pi-agent-core 提供 | Harness 层如何使用 |
|----|-----|
| `transformContext` | Layer 2 Context Manager 注入，实现压缩/裁剪 |
| `beforeToolCall` | Layer 5 Permission Manager 注入，实现权限拦截 |
| `afterToolCall` | 审计日志记录 |
| `agent.subscribe()` | Layer 6 Renderer 消费，驱动 UI |
| `agent.state.messages` | Layer 1 Session 读写，持久化/恢复 |
| `agent.state.tools` | Layer 4 Skill Registry 动态更新 |
| `steer()` / `followUp()` | 未来可用于 multi-agent 协调 |
