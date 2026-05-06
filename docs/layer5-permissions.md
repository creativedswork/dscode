# Layer 5: Permission / Safety

## 职责

- 在工具执行前拦截，实现权限审批
- 分级策略：always-allow, always-deny, ask-user
- 支持基于参数的细粒度规则（如拒绝危险 shell 命令）
- session 级权限授予（"本次始终允许"）
- 审计日志

## 核心类型

```typescript
type PermissionDecision = "allow" | "deny" | "ask";

interface PermissionRule {
  tool: string;                     // 工具名称，"*" 匹配所有
  argPattern?: RegExp;              // 匹配 JSON.stringify(args)
  decision: PermissionDecision;
  reason?: string;                  // deny 时的说明
  priority: number;                 // 数值越高优先级越高
}

interface PermissionManagerConfig {
  rules: PermissionRule[];
  defaultDecision: PermissionDecision;  // 无规则匹配时的默认行为
}

// 用户交互回调（由 Layer 6 UI 提供实现）
type PromptUserFn = (question: string, context: ToolCallContext) => Promise<{
  decision: "allow" | "deny";
  rememberForSession: boolean;
}>;

interface ToolCallContext {
  toolName: string;
  args: unknown;
  formattedPreview: string;         // 人类可读的参数预览
}
```

## PermissionManager

```typescript
class PermissionManager {
  private config: PermissionManagerConfig;
  private sessionGrants: Set<string>;   // 本 session 已授权的工具
  private promptUser: PromptUserFn;
  private auditLog: AuditEntry[];

  constructor(config: PermissionManagerConfig, promptUser: PromptUserFn);

  /**
   * beforeToolCall hook 实现
   * 返回 undefined = 放行
   * 返回 { block: true, reason } = 阻止
   */
  async check(
    context: BeforeToolCallContext,
    signal?: AbortSignal
  ): Promise<BeforeToolCallResult | undefined> {
    const toolName = context.toolCall.name;
    const args = context.args;

    // 1. 检查 session 级授权
    if (this.sessionGrants.has(toolName)) {
      this.audit("allow", toolName, args, "session-grant");
      return undefined;
    }

    // 2. 匹配规则（按 priority 降序）
    const decision = this.evaluateRules(toolName, args);

    switch (decision) {
      case "allow":
        this.audit("allow", toolName, args, "rule");
        return undefined;

      case "deny":
        this.audit("deny", toolName, args, "rule");
        return { block: true, reason: "Permission denied by policy" };

      case "ask":
        return this.askUser(toolName, args);
    }
  }

  private async askUser(toolName: string, args: unknown): Promise<BeforeToolCallResult | undefined> {
    const preview = this.formatPreview(toolName, args);
    const result = await this.promptUser(
      `Allow tool "${toolName}"?`,
      { toolName, args, formattedPreview: preview }
    );

    if (result.rememberForSession) {
      this.sessionGrants.add(toolName);
    }

    this.audit(result.decision, toolName, args, "user-prompt");

    if (result.decision === "deny") {
      return { block: true, reason: "Denied by user" };
    }
    return undefined;
  }

  grantForSession(toolName: string): void {
    this.sessionGrants.add(toolName);
  }

  revokeGrant(toolName: string): void {
    this.sessionGrants.delete(toolName);
  }

  getSessionGrants(): string[] {
    return Array.from(this.sessionGrants);
  }
}
```

## 默认规则集

```typescript
const DEFAULT_RULES: PermissionRule[] = [
  // 读操作始终允许
  { tool: "read_file", decision: "allow", priority: 10 },
  { tool: "list_files", decision: "allow", priority: 10 },
  { tool: "grep", decision: "allow", priority: 10 },
  { tool: "glob", decision: "allow", priority: 10 },

  // 写操作需要确认
  { tool: "write_file", decision: "ask", priority: 10 },

  // bash: 危险命令拒绝
  {
    tool: "bash",
    argPattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*--force)/,
    decision: "deny",
    reason: "Force-remove operations are blocked",
    priority: 100,
  },
  {
    tool: "bash",
    argPattern: /sudo\s/,
    decision: "deny",
    reason: "sudo operations are blocked",
    priority: 100,
  },
  {
    tool: "bash",
    argPattern: /chmod\s+777/,
    decision: "deny",
    reason: "chmod 777 is blocked",
    priority: 100,
  },
  {
    tool: "bash",
    argPattern: />\s*\/dev\/sd|mkfs|dd\s+if=/,
    decision: "deny",
    reason: "Disk operations are blocked",
    priority: 100,
  },

  // bash: 其他命令需要确认
  { tool: "bash", decision: "ask", priority: 1 },
];
```

## 参数预览格式化

给用户看的不是原始 JSON，而是人类友好的预览：

```typescript
private formatPreview(toolName: string, args: unknown): string {
  switch (toolName) {
    case "bash":
      return `$ ${(args as any).command}`;

    case "write_file": {
      const { path, content } = args as any;
      const lines = content.split("\n");
      const preview = lines.length > 10
        ? lines.slice(0, 10).join("\n") + `\n... (${lines.length} lines total)`
        : content;
      return `Write to: ${path}\n---\n${preview}`;
    }

    default:
      return JSON.stringify(args, null, 2);
  }
}
```

## 审计日志

```typescript
interface AuditEntry {
  timestamp: number;
  toolName: string;
  args: unknown;
  decision: "allow" | "deny";
  source: "rule" | "session-grant" | "user-prompt";
}

// 内存中保留最近 100 条，session 保存时可持久化
```

## 用户交互流程（由 Layer 6 UI 渲染）

```
┌────────────────────────────────────────────┐
│  Agent wants to run:                       │
│  $ git push origin main                   │
│                                            │
│  [Y] Allow  [N] Deny  [A] Allow always    │
└────────────────────────────────────────────┘
```

- `Y` → allow 本次
- `N` → deny 本次
- `A` → allow 本次 + grant for session

## 与 pi-agent-core 集成

```typescript
const agent = new Agent({
  beforeToolCall: (ctx, signal) => permissionManager.check(ctx, signal),
  afterToolCall: (ctx, signal) => {
    // 可用于审计工具执行结果
    auditLog.push({ ...ctx, result: ctx.result, isError: ctx.isError });
    return undefined;
  },
});
```

## Slash Commands

| 命令 | 说明 |
|------|------|
| `/permissions` | 显示当前 session 授权和规则 |
| `/permissions grant <tool>` | 手动授予 session 权限 |
| `/permissions revoke <tool>` | 撤销 session 权限 |
| `/permissions audit` | 显示最近的审计记录 |

## 配置

```json
{
  "permissions": {
    "defaultDecision": "ask",
    "rules": [
      { "tool": "read_file", "decision": "allow" },
      { "tool": "bash", "decision": "ask" },
      { "tool": "bash", "argPattern": "sudo", "decision": "deny" }
    ]
  }
}
```

## 安全考量

- **路径穿越防护**: `read_file`/`write_file` 应验证路径在允许范围内
- **命令注入**: bash 工具的命令来自 LLM，天然不可信，必须由用户审批
- **deny 规则优先**: 高 priority 的 deny 规则不可被 session grant 覆盖
- **超时**: `promptUser` 应有超时机制，避免无限阻塞
