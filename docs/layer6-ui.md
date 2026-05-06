# Layer 6: UI / Rendering

## 职责

- 交互式 REPL（readline 驱动）
- 流式输出渲染（文本、thinking、工具调用）
- Slash commands 解析和分发
- 权限确认 UI
- 状态指示（spinner、进度）
- ANSI 彩色输出和基础 Markdown 渲染

## 核心类型

```typescript
interface Renderer {
  renderTextDelta(delta: string): void;
  renderThinkingStart(): void;
  renderThinkingDelta(delta: string): void;
  renderThinkingEnd(): void;
  renderToolStart(name: string, args: unknown): void;
  renderToolEnd(name: string, result: unknown, isError: boolean): void;
  renderError(message: string): void;
  renderInfo(message: string): void;
  renderStatus(message: string): void;    // spinner
  clearStatus(): void;
  newLine(): void;
}

interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;                         // e.g. "/session load <id>"
  execute(args: string, harness: Harness): Promise<void>;
}

type PromptUserFn = (question: string, context: ToolCallContext) => Promise<{
  decision: "allow" | "deny";
  rememberForSession: boolean;
}>;
```

## REPL 主循环

```typescript
class Repl {
  private rl: readline.Interface;
  private harness: Harness;
  private commands: Map<string, SlashCommand>;
  private renderer: Renderer;

  async run(): Promise<void> {
    this.printWelcome();

    while (true) {
      const raw = await this.rl.question(this.formatPrompt());
      const line = raw.trim();

      if (!line) continue;
      if (line === "exit" || line === "quit") break;

      if (line.startsWith("/")) {
        await this.handleSlashCommand(line);
        continue;
      }

      // 用户输入 → agent.prompt
      this.renderer.renderStatus("Thinking...");
      try {
        await this.harness.prompt(line);
      } catch (err) {
        this.renderer.renderError(err instanceof Error ? err.message : String(err));
      }
      this.renderer.clearStatus();
      this.renderer.newLine();
    }
  }

  private async handleSlashCommand(input: string): Promise<void> {
    const [cmdName, ...argParts] = input.slice(1).split(/\s+/);
    const cmd = this.commands.get(cmdName);
    if (!cmd) {
      this.renderer.renderError(`Unknown command: /${cmdName}. Type /help for available commands.`);
      return;
    }
    await cmd.execute(argParts.join(" "), this.harness);
  }
}
```

## Renderer 实现

### ANSI 颜色工具

```typescript
const colors = {
  dim: (s: string) => `\x1b[90m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};
```

### 事件到渲染的映射

```typescript
function bindRenderer(agent: Agent, renderer: Renderer): () => void {
  return agent.subscribe((event) => {
    switch (event.type) {
      case "agent_start":
        renderer.renderStatus("Thinking...");
        break;

      case "agent_end":
        renderer.clearStatus();
        break;

      case "message_update": {
        const ev = event.assistantMessageEvent;
        switch (ev.type) {
          case "thinking_start":
            renderer.renderThinkingStart();
            break;
          case "thinking_delta":
            renderer.renderThinkingDelta(ev.delta);
            break;
          case "thinking_end":
            renderer.renderThinkingEnd();
            break;
          case "text_delta":
            renderer.renderTextDelta(ev.delta);
            break;
        }
        break;
      }

      case "tool_execution_start":
        renderer.renderToolStart(event.toolName, event.args);
        break;

      case "tool_execution_end":
        renderer.renderToolEnd(event.toolName, event.result, event.isError);
        break;
    }
  });
}
```

### 各 Formatter 输出样式

**Text (text.ts)**
```
assistant › 这是模型的回复文本，支持流式逐字输出。
```

**Thinking (thinking.ts)**
```
[thinking] 让我分析一下这个问题...（灰色/dim 显示）
```

**Tool Call (tool-call.ts)**
```
[tool] bash
  $ ls -la src/
[result] (0.3s)
  total 16
  drwxr-xr-x  5 user  staff  160 May  5 10:00 .
  -rw-r--r--  1 user  staff  245 May  5 10:00 index.ts
  ... (truncated, 15 lines)
```

**Error**
```
[error] Connection timeout after 30s
```

## Permission Prompt UI

```typescript
async function promptPermission(
  rl: readline.Interface,
  renderer: Renderer,
  question: string,
  context: ToolCallContext
): Promise<{ decision: "allow" | "deny"; rememberForSession: boolean }> {
  renderer.newLine();
  process.stdout.write(colors.yellow("┌─ Permission Required ─────────────────\n"));
  process.stdout.write(colors.yellow("│ ") + `Tool: ${colors.bold(context.toolName)}\n`);
  process.stdout.write(colors.yellow("│ ") + context.formattedPreview.split("\n").join("\n" + colors.yellow("│ ")) + "\n");
  process.stdout.write(colors.yellow("└───────────────────────────────────────\n"));
  process.stdout.write(`  [${colors.green("Y")}]es  [${colors.red("N")}]o  [${colors.cyan("A")}]lways allow > `);

  const answer = await rl.question("");
  const key = answer.trim().toLowerCase();

  switch (key) {
    case "y": case "yes": case "":
      return { decision: "allow", rememberForSession: false };
    case "a": case "always":
      return { decision: "allow", rememberForSession: true };
    case "n": case "no":
    default:
      return { decision: "deny", rememberForSession: false };
  }
}
```

## Slash Commands 注册

```typescript
const builtinCommands: SlashCommand[] = [
  {
    name: "help",
    description: "显示帮助",
    execute: async (_, harness) => {
      // 列出所有命令
    },
  },
  {
    name: "reset",
    description: "清空对话历史",
    execute: async (_, harness) => {
      harness.agent.reset();
      console.log(colors.dim("(conversation reset)"));
    },
  },
  {
    name: "model",
    usage: "/model <provider> <modelId>",
    description: "切换模型",
    execute: async (args, harness) => {
      const [provider, modelId] = args.split(/\s+/);
      harness.switchModel(provider, modelId);
    },
  },
  {
    name: "session",
    usage: "/session [list|load|save|new|delete]",
    description: "会话管理",
    execute: async (args, harness) => { /* 分发到子命令 */ },
  },
  {
    name: "memory",
    usage: "/memory [list|add|remove|clear]",
    description: "记忆管理",
    execute: async (args, harness) => { /* 分发到子命令 */ },
  },
  {
    name: "compact",
    description: "手动压缩上下文",
    execute: async (_, harness) => {
      await harness.forceCompact();
      console.log(colors.dim("(context compacted)"));
    },
  },
  {
    name: "cost",
    description: "显示本 session token 用量和费用",
    execute: async (_, harness) => {
      const usage = harness.getCumulativeUsage();
      console.log(`Input: ${usage.input} tokens ($${usage.cost.input.toFixed(4)})`);
      console.log(`Output: ${usage.output} tokens ($${usage.cost.output.toFixed(4)})`);
      console.log(`Cache: ${usage.cacheRead} read, ${usage.cacheWrite} write`);
      console.log(colors.bold(`Total: $${usage.cost.total.toFixed(4)}`));
    },
  },
  {
    name: "skills",
    usage: "/skills [activate|deactivate <name>]",
    description: "技能管理",
    execute: async (args, harness) => { /* ... */ },
  },
  {
    name: "permissions",
    usage: "/permissions [grant|revoke|audit]",
    description: "权限管理",
    execute: async (args, harness) => { /* ... */ },
  },
];
```

## Welcome Banner

```
╭──────────────────────────────────────────────╮
│  Agent Harness v0.1.0                        │
│  Model: deepseek-v4-flash (DeepSeek)         │
│  Skills: filesystem, bash, search            │
│  Type /help for commands, exit to quit       │
╰──────────────────────────────────────────────╯
```

## 键盘快捷键

- `Ctrl+C` → abort 当前 agent 执行（不退出程序）
- 双击 `Ctrl+C` → 退出程序
- `Ctrl+D` → 退出程序（EOF）

```typescript
let lastCtrlC = 0;
process.on("SIGINT", () => {
  if (agent.state.isStreaming) {
    agent.abort();
    renderer.renderInfo("(aborted)");
    return;
  }
  const now = Date.now();
  if (now - lastCtrlC < 500) {
    process.exit(0);
  }
  lastCtrlC = now;
  renderer.renderInfo("Press Ctrl+C again to exit");
});
```
