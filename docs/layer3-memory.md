# Layer 3: Memory System

## 职责

- 跨 session 持久化知识（用户偏好、项目上下文、学习到的事实）
- session 结束时自动提取记忆
- session 开始时将相关记忆注入 system prompt
- 支持全局记忆和项目级记忆

## 核心类型

```typescript
interface MemoryEntry {
  id: string;                       // ULID
  scope: "global" | "project";
  category: "preference" | "fact" | "instruction";
  content: string;                  // 自然语言描述
  source: {
    sessionId: string;
    timestamp: number;
  };
  relevance?: number;               // 检索排序用
}

interface MemoryStore {
  add(entry: Omit<MemoryEntry, "id">): Promise<MemoryEntry>;
  query(options: MemoryQuery): Promise<MemoryEntry[]>;
  update(id: string, content: string): Promise<void>;
  remove(id: string): Promise<void>;
  clear(scope?: "global" | "project"): Promise<void>;
}

interface MemoryQuery {
  scope?: "global" | "project";
  category?: MemoryEntry["category"];
  limit?: number;                   // 默认 20
  keyword?: string;                 // 全文搜索
}
```

## MemoryManager

```typescript
class MemoryManager {
  private store: MemoryStore;
  private projectPath: string;

  constructor(store: MemoryStore, projectPath: string);

  /**
   * 获取当前相关的记忆，格式化为 system prompt 片段
   */
  async getRelevantMemories(): Promise<string> {
    const global = await this.store.query({ scope: "global", limit: 10 });
    const project = await this.store.query({ scope: "project", limit: 10 });
    return this.formatForSystemPrompt(global, project);
  }

  /**
   * Session 结束时从对话中提取新记忆
   * 用 LLM 分析对话，提取值得记住的信息
   */
  async extractAndStore(messages: AgentMessage[], sessionId: string): Promise<void>;

  /**
   * 手动 CRUD
   */
  async addMemory(content: string, scope: "global" | "project", category?: string): Promise<void>;
  async listMemories(scope?: string): Promise<MemoryEntry[]>;
  async removeMemory(id: string): Promise<void>;
  async clearMemories(scope?: string): Promise<void>;
}
```

## 记忆提取

session 结束时自动调用，用 LLM 分析对话内容：

```typescript
async extractAndStore(messages: AgentMessage[], sessionId: string): Promise<void> {
  const transcript = this.serializeForExtraction(messages);

  const extractionPrompt = `
分析以下对话，提取值得长期记住的信息。分类如下：
- preference: 用户的偏好、习惯、风格要求
- fact: 项目相关的事实（架构、约定、限制）
- instruction: 用户给出的持久性指令

仅提取未来会有用的信息，忽略临时性内容。
每条记忆用一句话描述。

输出格式:
[{"category": "...", "scope": "global|project", "content": "..."}]

如果没有值得记住的信息，输出空数组 []。

---
对话内容:
${transcript}
`;

  const result = await completeSimple(extractionModel, [
    { role: "user", content: [{ type: "text", text: extractionPrompt }] }
  ]);

  // 解析并存储
  const entries = JSON.parse(extractTextFromMessage(result));
  for (const entry of entries) {
    await this.store.add({ ...entry, source: { sessionId, timestamp: Date.now() } });
  }
}
```

## 记忆注入 System Prompt

```typescript
private formatForSystemPrompt(global: MemoryEntry[], project: MemoryEntry[]): string {
  if (global.length === 0 && project.length === 0) return "";

  let section = "\n\n## Memories\n";

  if (global.length > 0) {
    section += "\n### User Preferences\n";
    for (const m of global) {
      section += `- ${m.content}\n`;
    }
  }

  if (project.length > 0) {
    section += "\n### Project Context\n";
    for (const m of project) {
      section += `- ${m.content}\n`;
    }
  }

  return section;
}
```

## 文件存储

```
~/.dscode/data/memory/
├── global.json                     # MemoryEntry[] 全局记忆
└── projects/
    └── <hash>.json                 # MemoryEntry[] 项目级记忆
```

项目 hash 由 CWD 的绝对路径生成：
```typescript
function projectHash(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 12);
}
```

## 去重与冲突

- 添加新记忆前，全文搜索是否已有相似条目
- 简单策略：如果新记忆与已有记忆的 normalized content 相似度 > 0.8（编辑距离），则更新已有条目而非新增
- 更复杂的方案（未来）：用 embedding 做语义去重

## Slash Commands

| 命令 | 说明 |
|------|------|
| `/memory list` | 列出所有记忆（分 global / project） |
| `/memory list global` | 仅全局记忆 |
| `/memory list project` | 仅项目记忆 |
| `/memory add <内容>` | 手动添加记忆（默认 project scope） |
| `/memory add global <内容>` | 手动添加全局记忆 |
| `/memory remove <id>` | 删除指定记忆 |
| `/memory clear` | 清空所有记忆 |

## 与其他层的交互

| 层 | 交互方式 |
|----|----------|
| Layer 0 | 注入 `agent.state.systemPrompt` 的 Memories 部分 |
| Layer 1 | session 结束事件触发记忆提取 |
| Layer 2 | Memory 内容增加 system prompt 长度，Context Manager 需计入 budget |
| Layer 6 | UI 提供 slash commands 交互 |

## 配置

```json
{
  "memory": {
    "enabled": true,
    "autoExtract": true,
    "maxGlobalEntries": 50,
    "maxProjectEntries": 100,
    "extractionModel": { "provider": "deepseek", "modelId": "deepseek-v4-flash" }
  }
}
```
