## Context

当前权限系统的 `PermissionManager.evaluate()` 只做精确工具名匹配（`rule.tool === toolName`）或全局匹配（`rule.tool === "*"`）。`MCPToolDefinition.alwaysLoad` 是 per-tool 级别的布尔值。用户无法用一条配置覆盖整个 MCP server 的工具。

settings.json 权限格式为对象数组 `rules: [{tool, decision, ...}]`，与 Claude Code 的 `allow`/`deny` 字符串数组不兼容。`persistRule()` 写入的也是对象格式。

权限 UI 只有 session 级别持久化（`rememberForSession`），没有文件持久化入口。

## Goals / Non-Goals

**Goals:**
- `PermissionRule.tool` 支持 `*` glob 通配，`mcp__lsp__*` 匹配该 server 全部工具
- settings.json 兼容 Claude Code 的 `allow`/`deny` 字符串数组格式
- TUI 和 Web UI 增加「Always Allow (save)」选项，将带通配的规则写入文件
- 三层权限模型完整：Allow once → Always Allow (session) → Always Allow save (persist)

**Non-Goals:**
- 不支持 `Tool(sub:pattern)` 语法（如 `Bash(git:*)`）——后续迭代
- 不改变 `argPattern` 的匹配逻辑
- 不改变 `denyPatterns`（文件路径 glob）的机制
- session 级别通配授权暂不实现（弹窗中 "Always Allow" 仍只记精确工具名）
- `alwaysLoadNames` 在 ToolRegistry 中的匹配逻辑暂不改动（留待后续）

## Decisions

### 1. Glob 匹配方案：复用现有 `globToRegex` 思路，但工具名分隔符不同

文件路径 glob 的 `globToRegex` 以 `/` 为分隔符。工具名用 `_` 做层级分隔，需要调整默认分隔符语义，或者使用简化版：`*` 匹配非空字符序列（`[^_]*`不够，因为工具名内部可能有单下划线），应对齐 Claude Code 行为：`*` 匹配任意字符串。

**决定**：tool glob 中 `*` 匹配任意字符（包括 `_`），等价于正则 `.*`。不引入 `**`。这最符合 Claude Code 的 `mcp__lsp__*` 语义。

实现：`PermissionManager` 内部将 `rule.tool` 中的 glob 模式编译为正则缓存。匹配优先级：精确匹配 → glob 匹配 → `*` 全局。

```typescript
// 伪代码
private compileToolPattern(tool: string): RegExp | null {
  if (!tool.includes("*")) return null; // 无通配，精确匹配
  const regex = tool.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${regex}$`);
}
```

### 2. settings.json 格式：双格式并存，读取时合并

```
settings.json:
{
  "permissions": {
    "allow": ["mcp__lsp__*", "read_file"],       // Claude Code 格式
    "deny": ["mcp__danger__*"],                   // Claude Code 格式
    "rules": [{ "tool": "bash", "decision": "ask" }]  // 现有格式（保留）
  }
}
```

- `allow` 数组转换为 `PermissionRuleConfig[]`：`decision: "allow"`, `priority: 5`
- `deny` 数组转换为 `PermissionRuleConfig[]`：`decision: "deny"`, `priority: 5`
- 与 `rules` 合并，`rules` 中显式声明的 priority 更高的优先
- 写入时使用 `allow`/`deny` 格式（Claude Code 兼容），但保留 `rules` 字段不删除

### 3. 持久化格式：`allow` 数组

`persistRule()` 写入时：
- 精确工具名 → `allow` 数组中加 `"bash"`
- 通配工具名 → `allow` 数组中加 `"mcp__lsp__*"`
- 不写 `rules` 对象（保持 Claude Code 兼容）

### 4. UI: PermOption 扩展

```
当前 TUI:  [Allow] [Always Allow] [Input Idea] [Deny]
当前 Web:  [Allow] [Always Allow] [Deny]

改为:
TUI:  [Allow] [Always Allow] [Save as Rule] [Deny]
Web:  [Allow] [Always Allow] [Save as Rule] [Deny]
```

- `"always_allow"`（session） → `rememberForSession: true`, 精确工具名
- `"always_allow_save"`（persist） → `rememberForSession: true` + `persistRule: { tool: toolName, decision: "allow" }`
- 移除 `"explain"` / `"Input Idea"`（TUI 已有但语义模糊，且与核心权限不相关）

**Wire protocol 扩展**：
```
ClientCommand.permission.decision: "allow" | "always_allow" | "always_allow_save" | "deny"
```

### 5. 优先级与冲突解决

- 当 `allow: ["mcp__github__*"]` 和 `rules: [{tool: "mcp__github__delete_repo", decision: "deny"}]` 同时存在时，`rules` 中精确匹配的优先级更高
- `evaluate()` 排序逻辑不变：先精确匹配，再 glob 匹配，再 `*`
- `priority` 字段仍生效：高 priority 的规则先匹配

## Risks / Trade-offs

- **Risk**: `*` 匹配过宽，意外放行危险工具 → Mitigation: 用户可配 `deny` 精确覆盖
- **Risk**: `allow`/`deny` 与 `rules` 双格式并存导致用户困惑 → Mitigation: persistRule 只写 `allow`，引导单一格式
- **Risk**: regex 编译开销 → Mitigation: 缓存编译结果，规则数量通常 < 50 条
