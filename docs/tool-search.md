# DeepSeek 项目：客户端工具搜索方案

## 一、背景

在 Anthropic API 中，ToolSearchTool 依赖两个协议层特性实现工具的按需加载：
- `defer_loading: true`：告知 API 暂不将工具 schema 放入模型上下文
- `tool_reference` 块：API 服务端自动将其展开为完整工具定义

DeepSeek / OpenAI / Gemini 等 API **不支持这两个特性**，因此无法直接复用 Anthropic 的服务端展开方案。但"按需加载工具定义以节省上下文"这一目标完全可以在客户端实现，无需 API 协议层的任何特殊支持。

---

## 二、核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         客户端                                    │
│                                                                  │
│  ┌──────────────────────────────┐                                │
│  │        ToolRegistry          │  工具注册表（启动时构建）       │
│  │                              │                                │
│  │  allTools: Map<name, {       │  所有工具（含完整 schema）     │
│  │    name, description,        │                                │
│  │    input_schema              │                                │
│  │  }>                          │                                │
│  │                              │                                │
│  │  deferredTools: Set<name>    │  可延迟加载的工具名称集合       │
│  │  discoveredTools: Set<name>  │  已被模型"发现"的工具集合       │
│  └──────────────────────────────┘                                │
│                                                                  │
│  ┌──────────────────────────────┐                                │
│  │      ConversationState       │  对话级状态（跟随对话持久化）   │
│  │                              │                                │
│  │  discoveredTools: Set<name>  │  当前对话中已发现的工具         │
│  │  lastSearchResult: string[]   │  最近一次搜索结果              │
│  └──────────────────────────────┘                                │
│                                                                  │
│  ┌──────────────────────────────┐                                │
│  │      RequestBuilder          │  请求构建器                    │
│  │                              │                                │
│  │  buildToolsForRequest():     │  决定本轮发送哪些工具          │
│  │    - 基础工具（永远发送）     │                                │
│  │    - SearchTool（永远发送）   │                                │
│  │    - 已发现的延迟工具（发送） │                                │
│  │    - 未发现的延迟工具（不发送）│                                │
│  └──────────────────────────────┘                                │
│                                                                  │
│  ┌──────────────────────────────┐                                │
│  │      ResultInterceptor       │  响应拦截器                    │
│  │                              │                                │
│  │  onToolResult(tool, result): │  拦截 SearchTool 的返回结果    │
│  │    if tool === SearchTool:   │  解析匹配的工具名称列表         │
│  │      discoveredTools.add(    │  更新已发现集合                 │
│  │        ...result.matches     │                                │
│  │      )                       │                                │
│  └──────────────────────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、关键数据结构

### 3.1 ToolRegistry（全局单例）

```typescript
interface ToolDefinition {
  name: string
  description: string
  input_schema: JsonSchema  // 完整的 JSON Schema
  searchHint?: string       // 辅助搜索的关键词
}

class ToolRegistry {
  // 所有工具的完整定义（包括 MCP 工具）
  private allTools: Map<string, ToolDefinition> = new Map()

  // 应延迟加载的工具名称（MCP 工具 + 显式标记 shouldDefer 的工具）
  private deferredToolNames: Set<string> = new Set()

  // 当前会话中已被模型"发现"的工具
  private discoveredToolNames: Set<string> = new Set()

  // 基础工具：永远随每次请求发送
  private baseToolNames: Set<string> = new Set()

  constructor() {
    this.baseToolNames.add('SearchTool')
    // ... 其他基础工具
  }

  /** 注册一个工具 */
  register(tool: ToolDefinition, options?: { defer?: boolean }): void {
    this.allTools.set(tool.name, tool)
    if (options?.defer && !this.baseToolNames.has(tool.name)) {
      this.deferredToolNames.add(tool.name)
    }
  }

  /** 判断某个工具是否应该延迟加载 */
  isDeferred(name: string): boolean {
    return this.deferredToolNames.has(name)
  }

  /** 获取所有延迟工具的名称列表（用于 SearchTool 搜索和 prompt 渲染） */
  getDeferredToolNames(): string[] {
    return [...this.deferredToolNames]
  }

  /** 获取已发现工具的名称集合 */
  getDiscoveredToolNames(): Set<string> {
    return this.discoveredToolNames
  }

  /** 模型发现了一批工具 */
  markAsDiscovered(names: string[]): void {
    for (const name of names) {
      if (this.deferredToolNames.has(name)) {
        this.discoveredToolNames.add(name)
      }
    }
  }

  /** 构建本次请求的工具列表 */
  buildToolsForRequest(): ToolDefinition[] {
    const tools: ToolDefinition[] = []

    for (const [name, def] of this.allTools) {
      // 基础工具：始终包含
      if (this.baseToolNames.has(name)) {
        tools.push(def)
        continue
      }

      // 非延迟工具：始终包含
      if (!this.deferredToolNames.has(name)) {
        tools.push(def)
        continue
      }

      // 延迟但已发现：包含完整 schema
      if (this.discoveredToolNames.has(name)) {
        tools.push(def)
        continue
      }

      // 延迟且未发现：不发送 schema
      // （模型通过 system prompt 中的名称列表知道它的存在）
    }

    return tools
  }

  /** 序列化已发现集合（用于跨压缩/跨会话持久化） */
  serializeDiscovered(): string[] {
    return [...this.discoveredToolNames]
  }

  /** 恢复已发现集合 */
  restoreDiscovered(names: string[]): void {
    this.discoveredToolNames = new Set(
      names.filter(n => this.deferredToolNames.has(n))
    )
  }
}
```

### 3.2 SearchTool 工具定义

```typescript
const SearchTool: ToolDefinition = {
  name: 'SearchTool',
  description: `搜索并按需加载延迟工具的完整定义。

查询方式：
- "select:ToolA,ToolB" — 按名称精确加载
- "github issues" — 关键词搜索
- "+slack send" — 要求"slack"必须在名称中出现`,

  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '查询字符串。支持 "select:<name>" 或关键词搜索。',
      },
      max_results: {
        type: 'integer',
        default: 5,
        description: '返回的最多匹配结果数',
      },
    },
    required: ['query'],
  },

  searchHint: 'tool_search discovery',
}
```

### 3.3 返回格式

SearchTool 的返回值**不使用 `tool_reference`**，直接以结构化 JSON 文本返回：

```typescript
interface SearchResult {
  matches: string[]            // 匹配的工具名称
  query: string                // 原始查询
  total_deferred_tools: number // 可被发现的工具总数
}

// SearchTool 的 call() 方法返回纯 JSON 文本：
function call(input: { query: string; max_results?: number }): string {
  const matches = searchDeferredTools(input.query, input.max_results ?? 5)
  return JSON.stringify({
    matches: matches.map(t => t.name),
    query: input.query,
    total_deferred_tools: toolRegistry.getDeferredToolNames().length,
  })
}
```

---

## 四、请求构建流程

### 4.1 每轮请求的工具列表构建

```typescript
function buildAPIRequest(
  messages: Message[],
  systemPrompt: string,
): APIRequest {
  const tools = toolRegistry.buildToolsForRequest()

  // 在 system prompt 中告知可发现的工具
  const undiscoveredNames = toolRegistry.getDeferredToolNames()
    .filter(n => !toolRegistry.getDiscoveredToolNames().has(n))

  const deferredHint = undiscoveredNames.length > 0
    ? `\n\n可发现的工具（调用 SearchTool 加载后使用）：\n${undiscoveredNames.map(n => `  - ${n}`).join('\n')}`
    : ''

  return {
    model: 'deepseek-v4',
    messages,
    system: systemPrompt + deferredHint,
    tools,
  }
}
```

### 4.2 完整的多轮交互时序

```
第 1 轮请求：
  tools: [Read, Write, Edit, Bash, SearchTool]
         // MCP 工具不在此列表中
  system: "...可发现的工具：mcp__github__list_issues, mcp__github__create_pr, ..."

  DeepSeek API 响应：
    model 需要 GitHub 功能
    → tool_calls: [SearchTool { query: "select:mcp__github__list_issues,mcp__github__create_pr" }]

  客户端处理：
    → 调用 SearchTool.call()，返回纯 JSON 文本
    → toolRegistry.markAsDiscovered(["mcp__github__list_issues", "mcp__github__create_pr"])

第 2 轮请求：
  tools: [Read, Write, Edit, Bash, SearchTool,
          mcp__github__list_issues,     // ← 现在携带完整 schema
          mcp__github__create_pr]       // ← 现在携带完整 schema
  system: "...可发现的工具：mcp__slack__send_message, ..."
          // 已发现的工具不再出现在"可发现"列表中

  DeepSeek API 响应：
    model 可以直接调用 mcp__github__list_issues 和 mcp__github__create_pr
```

---

## 五、SearchTool 搜索实现

### 5.1 评分算法

直接复用 Anthropic 方案的评分逻辑，核心不变：

```typescript
function searchDeferredTools(query: string, maxResults: number): ToolMatch[] {
  const deferredTools = toolRegistry.getDeferredToolNames()
    .map(name => toolRegistry.getAllTools().get(name)!)
    .filter(Boolean)

  // 精确选择模式
  const selectMatch = query.match(/^select:(.+)$/i)
  if (selectMatch) {
    const requested = selectMatch[1].split(',').map(s => s.trim())
    return requested
      .map(name => deferredTools.find(t => t.name === name))
      .filter(Boolean) as ToolMatch[]
  }

  // 关键词搜索
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const scored = deferredTools.map(tool => ({
    tool,
    score: calculateScore(tool, terms),
  }))

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
}

function calculateScore(tool: ToolDefinition, terms: string[]): number {
  const nameParts = parseToolName(tool.name) // 拆分为可搜索片段
  const desc = tool.description.toLowerCase()
  const hint = tool.searchHint?.toLowerCase() ?? ''

  let score = 0
  for (const term of terms) {
    // 精确名称片段匹配: +10
    if (nameParts.includes(term)) { score += 10 }
    // 部分名称匹配: +5
    else if (nameParts.some(p => p.includes(term))) { score += 5 }
    // searchHint 匹配: +4
    if (hint && hint.includes(term)) { score += 4 }
    // 描述匹配: +2
    if (desc.includes(term)) { score += 2 }
  }
  return score
}
```

---

## 六、模型如何"看到"延迟工具

### 6.1 System Prompt 中的工具描述

Anthropic 方案中，模型的 system prompt 包含 `<available-deferred-tools>` 块。客户端方案同样需要这个信息，只是形式更灵活：

**方式 A：System Prompt 中列出（推荐）**

```
## 可用工具

以下工具始终可用：
  Read, Write, Edit, Bash, Grep, SearchTool

以下工具需要先通过 SearchTool 搜索加载，之后即可直接调用：
  mcp__github__list_issues
  mcp__github__create_pr
  mcp__github__get_issue
  mcp__slack__send_message
  mcp__slack__list_channels

使用方式：当你需要上述某个工具时，先调用 SearchTool，搜索结果会包含该工具
的完整参数定义，之后你就可以直接调用它了。
```

**方式 B：在工具描述中嵌入**

SearchTool 的 description 字段可以包含当前可发现工具的概要：

```typescript
const searchToolDescription = `
搜索并按需加载工具的完整定义。

当前可发现的工具（${deferredCount}个）：
${deferredToolNames.map(n => `  - ${n}`).join('\n')}

查询方式：
- "select:ToolA,ToolB" — 精确加载
- "keyword" — 按关键词搜索
`
```

方式 A 更清晰（信息不会藏在工具描述中），方式 B 更简洁。推荐方式 A。

### 6.2 运行时行为差异

客户端方案中，模型在一次对话中可能需要调用 SearchTool **多次**——依次发现不同域的工具。例如：

1. 模型先处理 GitHub 操作 → 调用 SearchTool → 发现 3 个 GitHub 工具
2. 几个回合后需要 Slack → 再次调用 SearchTool → 发现 2 个 Slack 工具

这与 Anthropic 方案的行为一致，不需要额外适应。

---

## 七、响应拦截器

### 7.1 拦截 SearchTool 的调用结果

```typescript
/**
 * 在每次收到 API 响应后调用。
 * 如果响应中包含对 SearchTool 的调用，解析结果并更新已发现集合。
 */
function interceptToolCalls(choice: APIChoice): void {
  for (const toolCall of choice.message.tool_calls ?? []) {
    if (toolCall.function.name !== 'SearchTool') continue

    try {
      const result = JSON.parse(extractToolResult(toolCall))
      if (result.matches && result.matches.length > 0) {
        toolRegistry.markAsDiscovered(result.matches)
      }
    } catch {
      // SearchTool 调用异常，不影响主流程
    }
  }
}
```

### 7.2 错误恢复：模型调用未加载的工具

当模型意外调用了一个尚未发现的延迟工具，DeepSeek API 会返回"tool not found"错误。此时客户端不应直接将错误暴露给模型，而应主动提示：

```typescript
function handleUnknownTool(toolName: string): string {
  if (toolRegistry.isDeferred(toolName)) {
    // 这是一个合法但尚未加载的工具 → 引导模型加载
    return JSON.stringify({
      error: `Tool "${toolName}" has not been loaded yet. Call SearchTool with query "select:${toolName}" first, then retry.`,
    })
  }
  // 真正未知的工具
  return JSON.stringify({
    error: `Unknown tool: "${toolName}"`,
  })
}
```

这与 Anthropic 方案中 `toolExecution.ts` 的行为一致。

---

## 八、跨压缩持久化

当对话历史过长需要压缩（compact）时，已发现工具集合必须被保存——因为压缩会丢弃包含 SearchTool 调用结果的消息。

```typescript
interface CompactBoundary {
  type: 'compact_boundary'
  summary: string                        // 压缩摘要
  preCompactDiscoveredTools: string[]    // 压缩前的已发现工具集合
}

function compact(messages: Message[], summary: string): Message[] {
  const discovered = toolRegistry.serializeDiscovered()

  const boundary: CompactBoundary = {
    type: 'compact_boundary',
    summary,
    preCompactDiscoveredTools: discovered,
  }

  return [
    boundary,
    ...messagesAfterCompaction,
  ]
}

function restoreFromCompact(boundary: CompactBoundary): void {
  if (boundary.preCompactDiscoveredTools?.length > 0) {
    toolRegistry.restoreDiscovered(boundary.preCompactDiscoveredTools)
  }
}
```

---

## 九、与 MCP 服务器的集成

### 9.1 MCP 工具注册

当 MCP 服务器连接时，工具被注册到 ToolRegistry，默认标记为 `defer`：

```typescript
function onMcpServerConnected(serverName: string, tools: McpTool[]): void {
  for (const tool of tools) {
    const fullName = `mcp__${serverName}__${tool.name}`
    toolRegistry.register(
      {
        name: fullName,
        description: tool.description,
        input_schema: tool.inputSchema,
        searchHint: `${serverName} ${tool.name}`,
      },
      { defer: true },  // MCP 工具默认延迟
    )
  }
}

function onMcpServerDisconnected(serverName: string): void {
  // 从注册表中移除该服务器的所有工具
  toolRegistry.removeByServer(serverName)
  // 已发现集合中也会自动剔除这些工具（因为它们不再是延迟工具）
}
```

### 9.2 工具池变更通知

当 MCP 工具池发生变化（服务器连接/断开），需要更新 system prompt 中的可发现工具列表：

```typescript
function buildDeferredToolsHint(): string {
  const undiscovered = toolRegistry.getDeferredToolNames()
    .filter(n => !toolRegistry.getDiscoveredToolNames().has(n))

  if (undiscovered.length === 0) return ''

  return [
    '',
    '可发现的工具（调用 SearchTool 加载后使用）：',
    ...undiscovered.map(n => `  - ${n}`),
  ].join('\n')
}
```

---

## 十、完整实现流程

```
初始化阶段：
  1. 创建 ToolRegistry 实例
  2. 注册所有基础工具（Read, Write, Edit, Bash, SearchTool 等）
  3. 注册所有 MCP 工具（标记为 defer）
  4. 构建初始 system prompt

每轮请求前：
  5. toolRegistry.buildToolsForRequest() → 获取本轮 tools 数组
  6. buildDeferredToolsHint() → 附加到 system prompt
  7. 发送请求到 DeepSeek API

每轮响应后：
  8. interceptToolCalls() → 检查是否有 SearchTool 调用
     ├── 有 → 解析结果，markAsDiscovered()
     └── 无 → 无操作
  9. 继续下一轮（回到步骤 5）

压缩时：
  10. serializeDiscovered() → 保存在 boundary marker 中
  11. 恢复时调用 restoreDiscovered()
```

---

## 十一、与 Anthropic 方案的差异总结

| | Anthropic 服务端展开 | 客户端展开（本方案） |
|---|---|---|
| SearchTool 返回形式 | `tool_reference` 内容块 | 纯 JSON 文本 |
| Schema 展开 | API 服务端自动完成 | 客户端下一轮请求时注入 |
| 已发现工具追踪 | 扫描消息历史中的 `tool_reference` | 客户端内存中的 Set，可序列化 |
| 工具状态通知 | `<available-deferred-tools>` 消息或 delta 附件 | System prompt 中的文本列表 |
| 未加载工具的错误提示 | Zod 验证失败 + hint | 客户端拦截 + 引导消息 |
| 协议依赖 | beta header + `defer_loading` + `tool_reference` | 无 |
| 适用 API | Anthropic API / Bedrock / Vertex / Foundry | 任何支持 function calling 的 API |

---

## 十二、注意事项

1. **搜索结果的时机**：模型调用 SearchTool 的**同一轮**不能立即使用搜索结果中的工具。因为 API 已经处理完了工具列表。模型需要在**下一轮**才能调用。这是 client-side expansion 的固有延迟——但 LLM 通常能很好地处理这一点（它在同一轮中先搜索，下一轮再使用）。

2. **工具名称泄漏**：system prompt 中列出的延迟工具名称会占用少量 token。如果工具数量极大（>200），可以考虑只列出"可发现"的摘要信息而非完整名称列表，或者使用 domain 前缀聚类："github (3 tools), slack (5 tools), jira (8 tools)"。

3. **命名空间隔离**：工具名称应包含足够的命名空间信息以避免歧义。MCP 工具的 `mcp__server__action` 命名规范是很好的实践。

4. **与 Anthropic API 的兼容**：如果项目未来可能切换到 Anthropic API，建议在 ToolRegistry 中保留一个"展开策略"的抽象，使得可以无缝切换服务端展开和客户端展开：

```typescript
interface ExpansionStrategy {
  buildToolsForRequest(): ToolDefinition[]
  onSearchResult(names: string[]): void
  getDeferredHint(): string
}

class ServerSideExpansion implements ExpansionStrategy { /* Anthropic API */ }
class ClientSideExpansion implements ExpansionStrategy { /* DeepSeek / OpenAI */ }
```

## 十三、服务端 Prompt Cache 友好模式（推荐）

如果底层模型服务对请求前缀做缓存（通常会把 `system`、`tools` 和历史消息前缀一起纳入 cache key），那么“客户端按需展开”会天然影响命中率：

- **`tools` 数组变化**：新发现的工具会在下一轮请求中携带完整 schema
- **`system prompt` 变化**：如果提示词中的“可发现工具列表”会随着 discovered 集合变化而增减，那么每次搜索后前缀都会变化一次

其中第二点其实是**可避免的额外抖动**。因此推荐采用下面这种 cache-friendly 变体。

### 13.1 设计目标

不是“完全不打断 cache”——只要顶层 `tools` 真的增加了新 schema，服务端 cache 大概率还是会断一次；而是把影响收敛为：

- **首次发现一批新工具时**：允许发生一次 cache miss
- **其后的稳定轮次**：前缀重新稳定，继续积累新的 cache
- **避免每次搜索都同时改动 system prompt 和 tools**

### 13.2 推荐规则

1. **让 deferred tools 提示在一个 session 内保持稳定**

   `buildDeferredToolsHint()` 不要只列出“尚未发现”的工具，也不要在工具被发现后把它从列表中移除；应改为输出一个**稳定的 deferred catalog**（完整列表或稳定分组摘要）。

   也就是说，system prompt 中应表达：

   - “这些工具可以通过 SearchTool 加载”
   - 而不是“这些工具当前尚未加载”

   这样模型搜索过一次后，system prompt 不会因为 discovered 集合变化而改写。

2. **`tools` 列表保持 append-only 且顺序确定**

   基础工具顺序固定；延迟工具一旦被发现，就在后续请求中持续携带，不再移除，也不要因为重新排序导致前缀波动。这样至少能保证：

   - 稳定前缀尽可能长
   - provider 如果支持前缀分段/块级缓存，命中机会更高

3. **尽量按领域批量发现，而不是一次发现一个工具**

   比如模型要做 GitHub 操作时，SearchTool 可以一次返回并加载同域的 2～5 个高相关工具，而不是只加载一个。这样一次 cache miss 能换来后续多个回合的稳定前缀。

4. **高频工具继续走 always-load**

   对于高频、基础、几乎每个会话都会用到的 MCP 工具，仍然推荐在初始化时直接发送，避免中途触发 schema 扩容。

5. **如果 provider 支持显式 cache breakpoint，可把动态部分放到非缓存尾部**

   这是可选增强：对支持 prompt caching 分段控制的 provider，可以把可发现工具目录或其他高波动信息放进不参与缓存的尾部区块，进一步减小对稳定前缀的影响。

### 13.3 推荐的提示词形式

不要再用会随 discovered 状态变化的文案：

```text
以下工具需要先通过 SearchTool 搜索加载，之后即可直接调用：
```

改为稳定语义：

```text
以下工具属于 deferred catalog，可通过 SearchTool 按名称或关键词加载。
其中部分工具在当前会话中可能已经被加载；若已加载，可直接调用。
```

### 13.4 对比：原方案 vs cache-friendly 方案

| | 原方案 | Cache-friendly 方案 |
|---|---|---|
| system prompt 中的工具目录 | 只列 undiscovered 工具 | 列完整 deferred catalog 或稳定摘要 |
| 每次 search 后 system prompt | 会变化 | 不变化 |
| 每次 search 后 tools | 可能变化 | 可能变化 |
| 服务端 cache 抖动 | `system` + `tools` 同时波动 | 只在 schema 真扩容时波动 |

### 13.5 结论

客户端按需展开**无法完全避免**服务端 prompt cache 在“首次加载新工具”时失效；但通过“**稳定 system prompt + append-only tools + 批量发现**”三条原则，可以把 cache miss 从“几乎每次 search 都触发”降到“每个新工具域首次展开时触发一次”。
