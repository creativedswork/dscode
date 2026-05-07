# Layer 4: Skills / Plugins

## 职责

- 定义 Skill 抽象：工具集 + system prompt 扩展 + 激活条件
- 提供 SkillRegistry 管理技能的注册、激活、停用
- 实现内置 Skills（文件操作、Shell、搜索）
- 为第三方扩展提供接口

## 核心类型

```typescript
interface Skill {
  name: string;
  description: string;
  tools: AgentTool<any>[];
  systemPromptAddition?: string;    // 激活时追加到 system prompt
  activate?: (context: SkillContext) => Promise<void>;
  deactivate?: () => Promise<void>;
}

interface SkillContext {
  projectPath: string;
  config: Record<string, unknown>;
}

interface SkillRegistry {
  register(skill: Skill): void;
  unregister(name: string): void;
  activateSkill(name: string): Promise<void>;
  deactivateSkill(name: string): Promise<void>;
  getActiveSkills(): Skill[];
  getTools(): AgentTool<any>[];          // 所有激活 skill 的工具合集
  getSystemPromptAdditions(): string;    // 所有激活 skill 的 prompt 合集
  listAll(): Skill[];
}
```

## SkillRegistry 实现

```typescript
class SkillRegistryImpl implements SkillRegistry {
  private skills = new Map<string, Skill>();
  private active = new Set<string>();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  async activateSkill(name: string): Promise<void> {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Skill not found: ${name}`);
    if (skill.activate) await skill.activate(this.context);
    this.active.add(name);
  }

  getTools(): AgentTool<any>[] {
    return Array.from(this.active)
      .map(name => this.skills.get(name)!)
      .flatMap(skill => skill.tools);
  }

  getSystemPromptAdditions(): string {
    return Array.from(this.active)
      .map(name => this.skills.get(name)!)
      .filter(s => s.systemPromptAddition)
      .map(s => s.systemPromptAddition)
      .join("\n\n");
  }
}
```

## 内置 Skills

### filesystem

```typescript
const filesystemSkill: Skill = {
  name: "filesystem",
  description: "文件读写和目录列表",
  tools: [readFileTool, writeFileTool, listFilesTool],
  systemPromptAddition: `
You have access to the local filesystem. Use read_file to view files,
write_file to create or modify files, and list_files to explore directories.
Always use absolute paths.
  `,
};
```

#### read_file

```typescript
const readFileParams = Type.Object({
  path: Type.String({ description: "文件绝对路径" }),
  offset: Type.Optional(Type.Number({ description: "起始行号 (0-indexed)" })),
  limit: Type.Optional(Type.Number({ description: "读取行数，默认 200" })),
});

// execute: 读取文件内容，返回带行号的文本
// 安全: 验证路径在 projectPath 下（可配置）
// 限制: 单次最多返回 2000 行
```

#### write_file

```typescript
const writeFileParams = Type.Object({
  path: Type.String({ description: "文件绝对路径" }),
  content: Type.String({ description: "完整文件内容" }),
});

// execute: 写入文件（创建或覆盖）
// 安全: 需要 Layer 5 permission 审批
// 返回: 写入的字节数
```

#### list_files

```typescript
const listFilesParams = Type.Object({
  path: Type.String({ description: "目录绝对路径" }),
  recursive: Type.Optional(Type.Boolean({ description: "是否递归，默认 false" })),
  maxDepth: Type.Optional(Type.Number({ description: "递归最大深度，默认 3" })),
});

// execute: 列出目录内容（文件名 + 类型 + 大小）
// 安全: 排除 node_modules, .git 等
// 限制: 最多返回 500 条
```

### bash

```typescript
const bashSkill: Skill = {
  name: "bash",
  description: "Shell 命令执行",
  tools: [bashTool],
  systemPromptAddition: `
You can execute shell commands via the bash tool. Commands run in the project directory.
Prefer using other tools (read_file, write_file) for file operations.
Use bash for: git commands, running tests, installing packages, complex file operations.
  `,
};

const bashParams = Type.Object({
  command: Type.String({ description: "要执行的 shell 命令" }),
  timeout: Type.Optional(Type.Number({ description: "超时毫秒数，默认 30000" })),
});

// execute:
//   - spawn child process
//   - capture stdout + stderr
//   - 超时后 kill
//   - 返回 { stdout, stderr, exitCode }
// 安全: Layer 5 permission 拦截危险命令
```

### search

```typescript
const searchSkill: Skill = {
  name: "search",
  description: "文件内容搜索",
  tools: [grepTool, globTool],
  systemPromptAddition: `
Use grep to search file contents by pattern. Use glob to find files by name pattern.
  `,
};

const grepParams = Type.Object({
  pattern: Type.String({ description: "搜索模式 (正则表达式)" }),
  path: Type.Optional(Type.String({ description: "搜索路径，默认项目根目录" })),
  include: Type.Optional(Type.String({ description: "文件名 glob, e.g. '*.ts'" })),
  maxResults: Type.Optional(Type.Number({ description: "最大结果数，默认 50" })),
});

// execute: 使用 ripgrep 或 Node.js 原生实现
// 返回: 匹配行列表 [{ file, line, content }]

const globParams = Type.Object({
  pattern: Type.String({ description: "Glob 模式, e.g. 'src/**/*.ts'" }),
  cwd: Type.Optional(Type.String({ description: "搜索起始目录" })),
});

// execute: 返回匹配的文件路径列表
```

## 第三方 Skill 扩展

### 目录结构约定

```
~/.dscode/skills/
└── my-custom-skill/
    ├── skill.json                  # manifest
    └── index.js                    # 编译后的入口
```

### skill.json

```json
{
  "name": "my-custom-skill",
  "version": "1.0.0",
  "description": "A custom skill",
  "main": "./index.js"
}
```

### 加载方式

```typescript
async function loadExternalSkills(skillsDir: string): Promise<Skill[]> {
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(skillsDir, entry.name, "skill.json");
    if (!existsSync(manifestPath)) continue;

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const module = await import(join(skillsDir, entry.name, manifest.main));
    skills.push(module.default as Skill);
  }

  return skills;
}
```

## 与 pi-agent-core 集成

```typescript
// 在 Harness 初始化时
skillRegistry.register(filesystemSkill);
skillRegistry.register(bashSkill);
skillRegistry.register(searchSkill);

// 激活默认 skills
await skillRegistry.activateSkill("filesystem");
await skillRegistry.activateSkill("bash");
await skillRegistry.activateSkill("search");

// 注入 Agent
agent.state.tools = skillRegistry.getTools();
```

当 skill 动态激活/停用时：
```typescript
async activateSkill(name: string): Promise<void> {
  // ...
  // 更新 agent 的 tools 和 system prompt
  agent.state.tools = this.getTools();
  agent.state.systemPrompt = rebuildSystemPrompt();
}
```

## MCP (Model Context Protocol) 集成

MCP 是一种标准化的工具/资源协议，支持通过子进程（stdio）或网络（SSE）提供工具。

### 架构

```
MCP Server (stdio/SSE)
  ↓ JSON-RPC (tools/list, tools/call)
MCPClient (src/mcp/client.ts)
  ↓
MCPManager (src/mcp/manager.ts)
  ↓ registerMCPSkill()
SkillRegistry
  ↓ getTools()
Agent
```

### 配置方式

在 `~/.dscode/config.json` 或 `<project>/.dscode/config.json` 中配置：

```json
{
  "mcp": {
    "servers": [
      {
        "name": "playwright",
        "description": "Browser automation",
        "transport": "stdio",
        "command": "npx",
        "args": ["@anthropic/mcp-playwright"]
      },
      {
        "name": "remote-api",
        "description": "Remote API server",
        "transport": "sse",
        "url": "http://localhost:3001/mcp"
      }
    ]
  }
}
```

### 工具命名

MCP 工具注册到 Agent 时使用 `mcp_<server>_<tool>` 格式，避免命名冲突。

### 生命周期

- 启动时：`MCPManager.initialize()` → 连接所有 Server → `registerTools()` → 注册到 SkillRegistry
- 退出时：`MCPManager.shutdown()` → 发送 shutdown → kill 子进程 / 关闭 SSE

### 错误处理

- 连接失败不阻止启动，仅打印警告
- 工具调用超时默认 60s
- 子进程异常退出时自动拒绝所有 pending 请求

## Slash Commands

| 命令 | 说明 |
|------|------|
| `/skills` | 列出所有 skill 及其状态 |
| `/skills activate <name>` | 激活技能 |
| `/skills deactivate <name>` | 停用技能 |

