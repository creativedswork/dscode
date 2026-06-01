## Context

当前 `Harness.updateProjectPath()` 在切换项目路径时做了 MCP 重载：shutdown 旧 MCPManager → 创建新的 → 注册新 drivers 到 DriverRegistry。但 `ToolRegistry` 只在 `run()` 时通过 `initialize()` 从 DriverRegistry 构建过一次 `allTools` 索引，之后不再更新。

同时，`loadConfig()` 启动时合并了用户级 + 项目级 MCP 配置，而 `updateProjectPath()` 只读项目级 settings，行为不一致。

```
┌─ run() 初始化 ─────────────────────────────────────┐
│                                                    │
│  ToolRegistry.initialize()  ← 只调用一次            │
│    → 从 DriverRegistry 读取所有 driver.tools       │
│    → 存入 allTools Map（AgentTool 对象 + 闭包）     │
│                                                    │
└────────────────────────────────────────────────────┘

┌─ updateProjectPath() ──────────────────────────────┐
│                                                    │
│  old MCPManager.shutdown()  → clients: closed=true │
│  new MCPManager.initialize() → 新 clients 就绪      │
│  new MCPManager.registerDrivers(driverRegistry)    │
│    → DriverRegistry 已更新 ✅                       │
│                                                    │
│  ❌ ToolRegistry.initialize() 未调用                │
│  ❌ allTools 仍是旧 AgentTool（闭包→旧 closed client）│
│                                                    │
│  agent.state.tools = buildToolsForRequest()        │
│    → 返回旧工具 → 调用 closed client → 失败         │
│                                                    │
└────────────────────────────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**
- `updateProjectPath()` 后 MCP 工具调用正常工作
- `ToolRegistry.initialize()` 支持重复调用（重入安全）
- `updateProjectPath()` 的 MCP 配置加载与 `loadConfig()` 行为一致（合并用户 settings）

**Non-Goals:**
- 不改变 DriverRegistry 的行为
- 不改变 MCPManager 的生命周期管理
- 不改变 ToolRegistry 的搜索/发现机制

## Decisions

### Decision 1: `ToolRegistry.initialize()` 增加重入清理，而非新建实例

**方案 A**：在 `updateProjectPath()` 中 `new ToolRegistry(driverRegistry)` 替换掉 `this.toolRegistry`

**方案 B**：`ToolRegistry.initialize()` 支持重入，内部在重建索引前清理旧的 MCP 条目

**选择 B**。理由：`ToolRegistry` 被 TuiBackend 等组件通过 `deps.toolRegistry` 引用，新建实例会引入引用断裂问题；`initialize()` 本身就是"从 DriverRegistry 重新索引"的语义，只需补上清理步骤。

具体改动：
- `initialize()` 开头调用 `clearMcpEntries()`：遍历 `allTools` 删除 source 为 MCP 的条目，清空 `deferredToolNames`，清空 `discoveredToolNames`
- 保留 `baseToolNames` 和其他状态不变

### Decision 2: MCP 配置合并方式

在 `updateProjectPath()` 中调用 `loadUserSettings()` 并与 `newProjectSettings` 做浅合并（project 优先），与 `loadConfig()` 一致：

```
merged = { ...userSettings, ...newProjectSettings }
```

## Risks / Trade-offs

- **ToolRegistry 重入时清理 `discoveredToolNames`**：会"忘记"已发现的工具，下次 agent 需重新 `search_tools`。影响小，因为切换项目路径后上下文已重建，重发现是合理行为。
- **用户级 MCP 配置合并**：如果用户某全局 MCP 服务器的 `command` 路径依赖旧项目 cwd，切换项目后可能连接失败。这是已有行为，不引入新风险。
