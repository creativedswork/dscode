# Harness (Host)

## 职责

Harness 是进程级 host——组装依赖、管理生命周期、桥接各模块。它不做运行时决策（那是 Agent 的事），只负责：
1. 加载配置
2. 实例化各模块并注入依赖
3. 组装 Agent（传入 hooks）
4. 启动 REPL 循环
5. 优雅关闭（保存 session、提取 memory）

## 核心结构

```typescript
interface HarnessConfig {
  provider: string;                     // 默认 "deepseek"
  modelId: string;                      // 默认 "deepseek-v4-flash"
  thinkingLevel: ThinkingLevel;         // 默认 "off" (flash) 或 "medium" (pro)
  maxTokens: number;                    // 默认 16384
  projectPath: string;                  // CWD 或 DSCODE_PROJECT_PATH
  configDir: string;                    // ~/.dscode/
  dataDir: string;                      // ~/.dscode/data/
  context: ContextManagerConfig;
  memory: MemoryConfig;
  permissions: PermissionManagerConfig;
  skills: string[];                     // 默认激活的 skill 名称列表
}

class Harness {
  private agent: Agent;
  private sessionManager: SessionManager;
  private contextManager: ContextManager;
  private memoryManager: MemoryManager;
  private skillRegistry: SkillRegistry;
  private permissionManager: PermissionManager;
  private renderer: Renderer;
  private repl: Repl;
  private cumulativeUsage: Usage;

  constructor(config: HarnessConfig);

  async initialize(): Promise<void>;
  async run(): Promise<void>;
  async shutdown(): Promise<void>;

  // 供 slash commands 调用
  async prompt(input: string): Promise<void>;
  switchModel(provider: string, modelId: string): void;
  async forceCompact(): Promise<void>;
  getCumulativeUsage(): Usage;
}
```

## 初始化流程

```typescript
async initialize(): Promise<void> {
  // 1. 加载配置
  const config = await loadConfig(this.configPath);

  // 2. 初始化各层
  const sessionStore = new FileSessionStore(join(config.dataDir, "sessions"));
  this.sessionManager = new SessionManager(sessionStore);

  const memoryStore = new FileMemoryStore(join(config.dataDir, "memory"));
  this.memoryManager = new MemoryManager(memoryStore, config.projectPath);

  this.contextManager = new ContextManager(config.context);

  this.skillRegistry = new SkillRegistryImpl();
  this.registerBuiltinSkills();
  for (const name of config.skills) {
    await this.skillRegistry.activateSkill(name);
  }

  this.renderer = new TerminalRenderer();
  this.permissionManager = new PermissionManager(
    config.permissions,
    (question, ctx) => promptPermission(this.repl.rl, this.renderer, question, ctx)
  );

  // 3. 构建 system prompt
  const memories = await this.memoryManager.getRelevantMemories();
  const skillAdditions = this.skillRegistry.getSystemPromptAdditions();
  const systemPrompt = this.buildSystemPrompt(memories, skillAdditions);

  // 4. 获取模型
  const model = getModel(config.provider, config.modelId);

  // 5. 创建 Agent
  this.agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools: this.skillRegistry.getTools(),
      thinkingLevel: config.thinkingLevel,
    },
    streamFn: (m, ctx, opts) => streamSimple(m, ctx, { ...opts, maxTokens: config.maxTokens }),
    transformContext: (msgs, signal) => this.contextManager.transform(msgs, signal),
    beforeToolCall: (ctx, signal) => this.permissionManager.check(ctx, signal),
    sessionId: this.sessionManager.getCurrentSessionId() ?? undefined,
  });

  // 6. 绑定事件
  this.bindEvents();

  // 7. 创建或恢复 session
  const session = this.sessionManager.createSession(model);
  this.currentSession = session;
}
```

## System Prompt 构建

```typescript
private buildSystemPrompt(memories: string, skillAdditions: string): string {
  const base = `You are a helpful assistant working in the directory: ${this.config.projectPath}

You have access to tools for file operations, shell commands, and search.
Use tools when they help accomplish the user's request.
Answer in the user's language.
Be concise and direct.`;

  let prompt = base;

  if (skillAdditions) {
    prompt += "\n\n" + skillAdditions;
  }

  if (memories) {
    prompt += memories;  // 已包含 "## Memories" 标题
  }

  return prompt;
}
```

## 事件绑定

```typescript
private bindEvents(): void {
  // UI 渲染
  bindRenderer(this.agent, this.renderer);

  // Token 用量追踪
  this.agent.subscribe((event) => {
    if (event.type === "message_end") {
      const usage = event.message.usage;
      if (usage) {
        this.cumulativeUsage.input += usage.input;
        this.cumulativeUsage.output += usage.output;
        this.cumulativeUsage.cacheRead += usage.cacheRead;
        this.cumulativeUsage.cacheWrite += usage.cacheWrite;
        // 校准 token 估算
        this.contextManager.calibrate(usage.input);
      }
    }

    // 自动保存 session
    if (event.type === "agent_end") {
      this.sessionManager.saveSession(this.agent, this.currentSession);
    }
  });
}
```

## 运行和关闭

```typescript
async run(): Promise<void> {
  this.repl = new Repl(this.renderer, this, builtinCommands);
  await this.repl.run();
  await this.shutdown();
}

async shutdown(): Promise<void> {
  // 1. 保存当前 session
  await this.sessionManager.saveSession(this.agent, this.currentSession);

  // 2. 提取记忆（如果配置了 autoExtract）
  if (this.config.memory.autoExtract && this.agent.state.messages.length > 2) {
    await this.memoryManager.extractAndStore(
      this.agent.state.messages,
      this.currentSession.id
    );
  }

  // 3. 清理
  this.repl.close();
}
```

## 入口文件

```typescript
// src/core/main.ts
import { loadConfig } from "./config.js";
import { Harness } from "./harness.js";

async function main(): Promise<void> {
  const config = loadConfig();

  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("Missing DEEPSEEK_API_KEY.");
    process.exit(1);
  }

  const harness = new Harness(config);
  harness.initialize();
  await harness.run();
}

main();
```

## 配置加载优先级

```typescript
// src/config.ts
function loadConfig(): HarnessConfig {
  // 1. 确定项目路径
  const projectPath = resolve(process.env.DSCODE_PROJECT_PATH ?? process.cwd());

  // 2. 加载 .env (项目目录)
  loadEnvFile(projectPath);

  // 3. 加载两级配置
  const userConfig = loadJsonSafe(join(dsConfigHome(), "config.json"));
  const projectConfig = loadJsonSafe(join(projectPath, ".dscode", "config.json"));
  const merged = { ...userConfig, ...projectConfig };

  // 4. 环境变量覆盖
  const provider = process.env.AGENT_PROVIDER ?? merged.provider ?? "deepseek";
  const modelId = process.env.AGENT_MODEL ?? process.env.DEEPSEEK_MODEL ?? merged.modelId ?? "deepseek-v4-flash";
  const maxTokens = Number(process.env.DSCODE_MAX_TOKENS) || merged.maxTokens || 16384;

  // 5. permissions.deny 两级取并集
  const denyPatterns = [...new Set([...userDeny, ...projectDeny])];

  // 合并优先级: 默认值 < 用户级 < 项目级 < 环境变量
}
```

## 模型切换

```typescript
switchModel(provider: string, modelId: string): void {
  const model = getModel(provider, modelId);
  this.agent.state.model = model;

  // 调整 thinking level
  if (model.reasoning) {
    this.agent.state.thinkingLevel = "medium";
  } else {
    this.agent.state.thinkingLevel = "off";
  }

  // 更新 context budget (新模型可能有不同的 contextWindow)
  this.contextManager.updateModel(model);

  this.renderer.renderInfo(`Switched to ${model.name} (${provider})`);
}
```

## 数据流全景

```
用户输入
  │
  ▼
Repl.run() → slash command? ──yes──→ command.execute()
  │ no
  ▼
harness.prompt(input)
  │
  ▼
agent.prompt(input)
  │
  ├─→ transformContext() ← Layer 2 压缩
  │
  ▼
streamSimple() → LLM API
  │
  ├─→ subscribe: text_delta → Renderer
  ├─→ subscribe: thinking_delta → Renderer
  │
  ▼ (如有 tool_call)
beforeToolCall() ← Layer 5 权限检查
  │ allow
  ▼
tool.execute() ← Layer 4 Skill
  │
  ├─→ subscribe: tool_execution_end → Renderer
  │
  ▼ (feed back to LLM, loop)
agent_end
  │
  ├─→ subscribe: auto-save session ← Layer 1
  ├─→ subscribe: track usage
  │
  ▼
等待下一次用户输入
```
