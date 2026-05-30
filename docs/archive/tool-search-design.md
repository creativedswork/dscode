# Tool Search 实现方案：技术细节

## 一、架构定位

Tool Search 在现有分层架构中的位置：

```
Layer 4: Skills / Plugins (工具注册, 技能包)
    ↑ 依赖
Layer 4.5: Tool Search (工具发现, 延迟加载)  ← NEW
    ↑ 包装
Layer 4: Driver Registry (驱动注册, 工具所有权)
```

**核心原则**：Tool Search 不修改 DriverRegistry 的核心逻辑，而是作为一层 wrapper 添加延迟加载语义。`search_tools` 工具本身是一个新的 builtin driver，遵循现有 driver 模式。

---

## 二、文件规划

```
src/drivers/
├── registry.ts          # 修改：新增 getDriversBySource() 方法
├── discovery.ts         # 新增：discovery driver，提供 search_tools 工具
├── tool-registry.ts     # 新增：ToolRegistry，包装 DriverRegistry 添加延迟加载
├── fs.ts                # 不变
├── shell.ts             # 不变
└── search.ts            # 不变

tests/drivers/
└── tool-registry.test.ts  # 新增：ToolRegistry 单元测试

docs/impl/
└── tool-search-design.md  # 本文档
```

---

## 三、核心组件设计

### 3.1 MCP 类型改动

`MCPToolDefinition` 新增 `alwaysLoad` 字段：

```typescript
// src/mcp/types.ts
interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  alwaysLoad?: boolean;  // NEW: true = 始终发送，不走延迟加载
}
```

`MCPManager` 收集 alwaysLoad 工具名：

```typescript
// src/mcp/manager.ts
class MCPManager {
  private alwaysLoadToolNames = new Set<string>();

  // registerDrivers() 中不变，但 buildAgentTool() 记录 alwaysLoad 工具
  private buildAgentTool(serverName: string, def: MCPToolDefinition, client: MCPClient): AgentTool<any> {
    const toolName = `mcp_${serverName}_${def.name}`;
    if (def.alwaysLoad) {
      this.alwaysLoadToolNames.add(toolName);
    }
    // ... 其余不变 ...
  }

  /** 供 ToolRegistry 查询哪些 MCP 工具应始终加载 */
  getAlwaysLoadToolNames(): Set<string> {
    return this.alwaysLoadToolNames;
  }
}
```

### 3.2 DriverRegistry 改动（最小化）

只新增一个查询方法，不改变现有逻辑：

```typescript
// src/drivers/registry.ts — 新增方法
class DriverRegistry {
  // ... 现有方法不变 ...

  /** 按 source 过滤 drivers。用于 ToolRegistry 区分 builtin vs MCP 工具。 */
  getDriversBySource(source: "builtin" | "mcp"): Driver[] {
    return [...this.drivers.values()].filter(d => d.source === source);
  }
}
```

### 3.3 ToolRegistry（src/drivers/tool-registry.ts）

ToolRegistry 是 DriverRegistry 的包装层，负责：
- 区分哪些工具应该延迟加载（MCP 工具中 `alwaysLoad !== true` 的）
- 跟踪哪些延迟工具已被模型"发现"
- 构建每轮请求的工具列表
- 生成 system prompt 中的"可发现工具"提示

**类型定义**：

```typescript
interface ToolSearchEntry {
  name: string;
  description: string;
  searchHint: string;    // 辅助搜索关键词（服务名 + 工具名）
  tool: AgentTool<any>;  // 完整工具定义（含 schema）
}

class ToolRegistry {
  private driverRegistry: DriverRegistry;
  private allTools: Map<string, ToolSearchEntry>;
  private deferredToolNames: Set<string>;     // 应延迟加载的工具
  private discoveredToolNames: Set<string>;   // 已发现的延迟工具
  private baseToolNames: Set<string>;         // 始终发送的工具
  private initialized: boolean;
}
```

**初始化流程**：

```
ToolRegistry.initialize(skillTool, alwaysLoadNames?)
  │
  ├── 1. 从 DriverRegistry 获取所有 builtin 驱动工具
  │      → 这些工具不标记为 deferred（始终发送）
  │
  ├── 2. 从 DriverRegistry 获取所有 MCP 驱动工具
  │      ├── 如果工具名在 alwaysLoadNames 中 → 不标记为 deferred（始终发送）
  │      └── 否则 → 标记为 deferred（延迟加载）
  │
  ├── 3. search_tools 自身作为 base tool（始终发送）
  │
  └── 4. skill 工具作为 base tool（始终发送）
```

**alwaysLoad 语义**：当 MCP 工具声明 `alwaysLoad: true` 时，它的行为与 builtin 工具完全一致 — 始终随每次请求发送，不出现在"可发现工具"列表中，不参与 search_tools 搜索。

**关键 API**：

| 方法 | 说明 |
|------|------|
| `initialize(skillTool)` | 扫描所有 driver 工具，分类为 base/deferred |
| `buildToolsForRequest()` | 返回本轮请求应发送的工具列表 |
| `buildDeferredToolsHint()` | 返回 system prompt 中的"可发现工具"区块 |
| `search(query, maxResults)` | 搜索延迟工具，返回匹配项 |
| `markAsDiscovered(names)` | 将工具标记为已发现（由 search_tools.execute 调用） |
| `serializeDiscovered()` | 序列化已发现集合（用于 session 持久化） |
| `restoreDiscovered(names)` | 恢复已发现集合（从持久化的 session） |
| `refresh()` | MCP 服务器变更后重新扫描（预留，本期不实现） |

**buildToolsForRequest() 逻辑**：

```
for each tool in allTools:
  if tool is base tool → 包含
  else if tool is NOT deferred → 包含
  else if tool IS deferred AND IS discovered → 包含（完整 schema）
  else (deferred AND NOT discovered) → 不发送
```

**buildDeferredToolsHint() 逻辑**：

推荐采用 **cache-friendly 模式**：不要只输出 deferred 且 NOT discovered 的工具，而是输出一个在会话内保持稳定的 deferred catalog。

```
获取所有 deferred 工具（不区分 discovered 状态）
按 MCP 服务器前缀分组（如 mcp_github, mcp_slack）
生成：
  ## Discoverable Tools

  The following tools belong to the deferred catalog.
  Call `search_tools` to load them by keyword or exact name.
  Some of them may already be loaded in this session.

  **mcp_github** (3 tools)
    - mcp_github_list_issues — List GitHub issues
    - mcp_github_create_pr — Create a pull request
    - mcp_github_get_issue — Get issue details
```

这样 `discoveredToolNames` 的变化不会改写 system prompt，从而减少服务端 prompt cache 抖动。只有 `tools` 数组在首次发现新工具后发生真实扩容时，才会触发一次新的前缀。

**搜索评分算法**（与 Anthropic 方案一致）：

```
对每个 term:
  精确名称片段匹配（如 term === namePart）:  +10
  部分名称匹配（如 namePart 包含 term）:     +5
  searchHint 匹配:                           +4
  描述匹配:                                  +2
```

### 3.4 Discovery Driver（src/drivers/discovery.ts）

一个新的 builtin driver，提供 `search_tools` 工具。

```typescript
// Driver 定义
const discoveryDriver: Driver = {
  name: "discovery",
  description: "Tool discovery and deferred loading",
  tools: [searchToolsTool],
  source: "builtin",
};

// 工厂函数：需要 ToolRegistry 引用来执行搜索
function makeSearchToolsTool(registry: ToolRegistry): AgentTool<typeof searchParams> {
  return {
    name: "search_tools",
    label: "Search Tools",
    description: `Search and load deferred tools by name or keyword...`,
    parameters: Type.Object({
      query: Type.String({
        description: 'Search query. "select:ToolA,ToolB" for exact names, or keywords.',
      }),
      max_results: Type.Optional(Type.Number({
        description: "Max results (default: 5)",
      })),
    }),
    execute: async (_id, params) => {
      const matches = registry.search(params.query, params.max_results ?? 5);

      // 副作用：标记为已发现
      if (matches.length > 0) {
        registry.markAsDiscovered(matches.map(m => m.name));
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            matches: matches.map(m => ({ name: m.name, description: m.description })),
            query: params.query,
            total_deferred_tools: registry.getDeferredToolNames().length,
          }, null, 2),
        }],
        details: { matchCount: matches.length },
      };
    },
  };
}
```

**关键设计决策：搜索即发现**

`search_tools.execute()` 在返回搜索结果的同时，将匹配的工具标记为已发现。这意味着：
- 模型调用 search_tools 获取结果后，下一轮请求中这些工具会自动出现在 tools 列表中
- 不需要额外的拦截步骤
- 这利用了 Agent 的 turn 机制：当前 turn 中 search_tools 返回文本结果 → 下一 turn 工具列表更新

### 3.5 工具分类总览

| 工具 | 来源 | ToolRegistry 分类 | 发送时机 |
|------|------|-------------------|----------|
| read_file, write_file, list_files | driver: fs (builtin) | 非延迟 | 每轮都发送 |
| bash | driver: shell (builtin) | 非延迟 | 每轮都发送 |
| grep, glob | driver: search (builtin) | 非延迟 | 每轮都发送 |
| search_tools | driver: discovery (builtin) | base tool | 每轮都发送 |
| skill | harness (makeSkillTool) | base tool | 每轮都发送 |
| mcp__* (alwaysLoad: true) | driver: mcp_* (mcp) | 非延迟 | 每轮都发送 |
| mcp__* (alwaysLoad: false/未设置) | driver: mcp_* (mcp) | 延迟 | 发现后发送 |

---

## 四、harness.ts 集成方案

### 4.1 初始化流程变化

```
现有流程：
  1. new DriverRegistry()
  2. skillManager.activate() × N
  3. buildSystemPrompt()
  4. new Agent({ tools: [skillTool] })
  5. agent.state.tools = [...driverRegistry.getAllTools(), skillTool]

新流程：
  1. new DriverRegistry()
  2. new ToolRegistry(driverRegistry)
  3. new DiscoveryDriver(toolRegistry) → 注册到 DriverRegistry
  4. skillManager.activate() × N
  5. buildSystemPrompt()  ← 现在包含工具搜索使用说明
  6. new Agent({ tools: [skillTool] })
  7. MCPManager.initialize() + registerDrivers()
  8. toolRegistry.initialize(skillTool, mcpManager.getAlwaysLoadToolNames())
  9. agent.state.tools = toolRegistry.buildToolsForRequest()
```

### 4.2 transformContext 包装

`transformContext` 在每次 API 请求前被调用。我们在此更新工具列表和 system prompt。

**Prompt cache 注意事项**：这里推荐只让 `buildToolsForRequest()` 反映 discovered 状态，而让 `buildDeferredToolsHint()` 在一个 session 内尽量保持稳定。否则每次 `search_tools` 后，`system prompt` 和 `tools` 会同时变化，服务端 prompt cache 更容易失效。

```typescript
// harness.ts — transformContext 增强
transformContext: async (msgs: AgentMessage[], signal?: AbortSignal) => {
  // 1. 根据已发现状态更新工具列表
  this.agent.state.tools = this.toolRegistry.buildToolsForRequest();

  // 2. 更新 system prompt 中的可发现工具列表
  const deferredHint = this.toolRegistry.buildDeferredToolsHint();
  this.agent.state.systemPrompt = this.baseSystemPrompt + deferredHint;

  // 3. 执行正常的上下文压缩
  return this.contextManager.transform(msgs, signal) as Promise<AgentMessage[]>;
},
```

其中 `this.baseSystemPrompt` 是初始化时构建的 system prompt（不含 deferred 列表），缓存在 harness 实例上。

### 4.3 buildSystemPrompt 变化

在现有 system prompt 末尾追加工具搜索使用说明：

```markdown
## Tool Search

You have a `search_tools` tool for discovering additional tools. Some tools
(especially MCP tools from connected servers) are not loaded by default to
save context.

When you need a tool that is not in your current tool list:
1. Call `search_tools` with keywords describing what you need
2. The matching tools will become available in your next message
3. Then call the newly loaded tools directly

You can also load tools by exact name: `search_tools` with `select:ToolA,ToolB`
```

### 4.4 完整多轮交互时序

**推荐行为**：`search_tools` 触发后，下一轮只让 `tools` 扩容；不要同时把 system prompt 里的 Discoverable Tools 列表改写成“扣除已发现工具后的剩余列表”。后者虽然更精确，但会无谓打断服务端 prompt cache。

```
第 1 轮请求：
  agent.state.tools: [read_file, write_file, list_files, bash, grep, glob,
                       search_tools, skill]
                       // ← 没有 MCP 工具
  agent.state.systemPrompt: "...可发现的工具：mcp_github_list_issues, ..."

  DeepSeek 响应：
    → model 需要 GitHub 功能
    → tool_calls: [search_tools { query: "github issues" }]

  search_tools 执行：
    → toolRegistry.search("github issues") → [{ mcp_github_list_issues, ... }]
    → toolRegistry.markAsDiscovered(["mcp_github_list_issues"])

第 2 轮请求（transformContext 触发）：
  agent.state.tools: [read_file, write_file, list_files, bash, grep, glob,
                       search_tools, skill,
                       mcp_github_list_issues]  // ← 现在包含完整 schema
  agent.state.systemPrompt: "...可发现的工具：mcp_github_create_pr, ..."
                            // ← 已发现的工具不再出现

  DeepSeek 响应：
    → model 可以直接调用 mcp_github_list_issues
```

---

## 五、与现有系统的兼容性

### 5.1 Skill 工具不变

Skill 工具仍然是 base tool，每次都发送。Skill 的 activate 流程不变 —— 它只过滤 DriverRegistry 中的工具名称白名单，不涉及 ToolRegistry。

### 5.2 MCP 集成不变

MCPManager.registerDrivers() 流程不变。ToolRegistry 在 initialize() 时扫描所有已注册的 driver，自动识别 MCP 工具。

### 5.3 测试更新

`tests/core/harness.test.ts` 中的测试 "should have exactly 6 unique tool names from builtin drivers" 需要更新为 7（新增 search_tools）。

新增测试文件 `tests/drivers/tool-registry.test.ts`：
- 测试 ToolRegistry 正确分类 builtin vs MCP 工具
- 测试 search 评分算法
- 测试 markAsDiscovered / buildToolsForRequest 流程
- 测试 buildDeferredToolsHint 输出格式
- 测试 select: 精确匹配

### 5.4 权限系统

search_tools 是只读操作（不执行任何外部命令），应默认 allow：
```typescript
// permissions/rules.ts — 新增规则
{ tool: "search_tools", decision: "allow", priority: 100 }
```

---

## 六、边界情况处理

### 6.1 搜索无结果

```json
{
  "matches": [],
  "query": "nonexistent tool",
  "total_deferred_tools": 15,
  "hint": "No tools matched. Try different keywords or check the discoverable tools list in the system prompt."
}
```

### 6.2 所有工具已发现

当所有延迟工具都已被发现时，`buildDeferredToolsHint()` 返回空字符串。system prompt 中没有"可发现工具"区块。

### 6.3 无 MCP 服务器连接

如果没有配置任何 MCP 服务器，`deferredToolNames` 为空集合，`buildDeferredToolsHint()` 返回空字符串。ToolRegistry 行为和未启用 tool search 时一致。

### 6.4 模型在发现前直接调用延迟工具

当模型直接调用了一个尚未发现的 MCP 工具时，API 会返回错误（工具不在 tools 列表中）。pi-agent-core 会将其作为工具执行错误处理。这种情况需要：

- **方案 A（推荐）**：依赖 LLM 自身能力 —— DeepSeek 模型在 system prompt 中看到"可发现工具"列表后，通常会在调用前先使用 search_tools。如果真的出现直接调用，错误信息本身就足以让模型在下一轮修正。
- **方案 B**：在 `beforeToolCall` 中拦截并返回引导消息 —— 判断如果工具名在 deferredToolNames 但不在 discoveredToolNames 中，阻止执行并返回提示。

本期采用方案 A，保持简单。

### 6.5 Context 压缩后

ToolRegistry 的 discoveredToolNames 是内存中的 Set，不受消息压缩影响。压缩只移除旧消息，不改变 ToolRegistry 状态。这是 client-side 方案相比 server-side 方案的一个优势。

### 6.6 Session 恢复

Session 持久化时，保存 discoveredToolNames：
```typescript
// session/manager.ts — saveSession 增强
const discovered = toolRegistry.serializeDiscovered();
// 存入 session metadata 或作为一个特殊的 system message
```

Session 恢复时，调用 `toolRegistry.restoreDiscovered(names)`。

**本期可选实现**，因为 session 恢复在 DSCode 中尚未完整实现。

---

## 七、实施步骤

| 步骤 | 文件 | 内容 |
|------|------|------|
| 1 | `src/drivers/registry.ts` | 新增 `getDriversBySource()` |
| 2 | `src/mcp/types.ts` | `MCPToolDefinition` 新增 `alwaysLoad?: boolean` |
| 3 | `src/mcp/manager.ts` | `buildAgentTool()` 收集 alwaysLoad 工具名，新增 `getAlwaysLoadToolNames()` |
| 4 | `src/drivers/tool-registry.ts` | 新建 ToolRegistry 类，`initialize()` 接受 `alwaysLoadNames` 参数 |
| 5 | `src/drivers/discovery.ts` | 新建 discovery driver + search_tools 工具 |
| 6 | `src/permissions/rules.ts` | 新增 search_tools 默认 allow |
| 7 | `src/core/harness.ts` | 集成 ToolRegistry，传递 `alwaysLoadNames`，修改 buildSystemPrompt、transformContext、初始化流程 |
| 8 | `tests/drivers/tool-registry.test.ts` | ToolRegistry 单元测试（含 alwaysLoad 场景） |
| 9 | `tests/core/harness.test.ts` | 无需修改（discovery driver 由 harness 动态注册，DriverRegistry 默认仍是 6 个工具） |

---

## 八、与 Anthropic 方案的对比

| | Anthropic 服务端展开 | DSCode 客户端展开 |
|---|---|---|
| 展开位置 | API 服务端 | harness.ts transformContext |
| SearchTool 返回 | `tool_reference` 内容块 | JSON 文本（model 可读） |
| 已发现追踪 | 消息历史中的 tool_reference | ToolRegistry 内存 Set |
| 工具列表提示 | `<available-deferred-tools>` delta | system prompt 文本区块 |
| 协议依赖 | `defer_loading` + `tool_reference` | 无 |
| 压缩后状态 | 需要在 boundary marker 中保存 | 自动保留（内存中） |

---

## 九、不实现的部分（本期 out of scope）

1. **运行时 MCP 服务器重连**：如需支持，调用 `toolRegistry.refresh()` 即可。本期假设 MCP 只在启动时连接。
2. **ExpansionStrategy 抽象**：设计文档中提到的 `ServerSideExpansion` / `ClientSideExpansion` 切换。本期不需要，DSCode 只对接 DeepSeek。
3. **Compact boundary marker**：由于 ToolRegistry 在内存中，压缩不需要特殊处理。session 恢复时的持久化可作为后续增强。