# Layer 1: Session Management

## 职责

- 将对话状态（消息历史 + 元数据）持久化到磁盘
- 支持恢复之前的会话继续对话
- 维护 session 索引（标题、时间、模型、消息数）
- 每轮对话结束后自动保存

## 核心类型

```typescript
interface SessionMetadata {
  id: string;                       // ULID (时间可排序, 无碰撞)
  title: string;                    // 首条用户消息截取 60 字符，或 LLM 生成摘要
  createdAt: number;                // Unix ms
  updatedAt: number;
  modelProvider: string;            // e.g. "deepseek"
  modelId: string;                  // e.g. "deepseek-v4-flash"
  messageCount: number;
  estimatedTokens: number;          // 由 Layer 2 token estimator 提供
}

interface SerializedSession {
  version: 1;                       // schema 版本号，便于未来迁移
  metadata: SessionMetadata;
  messages: AgentMessage[];         // 完整消息历史
  compactedPrefix?: string;         // Layer 2 压缩产生的摘要前缀
}

interface SessionStore {
  save(session: SerializedSession): Promise<void>;
  load(id: string): Promise<SerializedSession | null>;
  list(): Promise<SessionMetadata[]>;
  delete(id: string): Promise<void>;
}
```

## SessionManager

```typescript
class SessionManager {
  private store: SessionStore;
  private currentSession: SessionMetadata | null;

  constructor(store: SessionStore);

  // 创建新 session
  createSession(model: Model<any>): SessionMetadata;

  // 保存当前 session（读取 agent.state.messages）
  saveSession(agent: Agent, metadata: SessionMetadata): Promise<void>;

  // 加载 session 并恢复到 agent
  loadSession(id: string, agent: Agent): Promise<boolean>;

  // 列出所有 session（按时间倒序）
  listSessions(): Promise<SessionMetadata[]>;

  // 删除 session
  deleteSession(id: string): Promise<void>;

  // 获取当前 session ID（用于 prompt caching 亲和）
  getCurrentSessionId(): string | null;
}
```

## 文件存储实现

```
~/.dscode/data/sessions/
├── index.json                      # SessionMetadata[] 索引
├── 01JXYZ...abc.json              # 单个 session 完整数据
├── 01JXYZ...def.json
└── ...
```

### 写入策略

原子写入避免损坏：
1. 写入 `<id>.tmp.json`
2. `rename()` 到 `<id>.json`
3. 更新 `index.json`（同样原子写入）

### Session 标题生成

优先级：
1. 首条用户消息截取前 60 字符
2. （可选）首轮对话结束后，用 LLM 生成一行标题

## 与 pi-agent-core 集成

### 自动保存

```typescript
agent.subscribe((event) => {
  if (event.type === "agent_end") {
    sessionManager.saveSession(agent, currentMetadata);
  }
});
```

### 恢复 Session

```typescript
async loadSession(id: string, agent: Agent): Promise<boolean> {
  const session = await this.store.load(id);
  if (!session) return false;

  agent.state.messages = session.messages;
  // 如果有 compactedPrefix，作为首条合成消息注入
  this.currentSession = session.metadata;
  return true;
}
```

## Slash Commands

| 命令 | 说明 |
|------|------|
| `/session list` | 列出最近 20 个 session（ID、标题、时间、消息数） |
| `/session load <id>` | 加载指定 session |
| `/session save` | 强制保存当前 session |
| `/session delete <id>` | 删除指定 session |
| `/session new` | 新建空 session（保存当前并切换） |

## 设计注意事项

- **ULID 而非 UUID**: 时间可排序，天然按创建时间排列
- **单文件一个 session**: 避免单个大文件，便于删除和管理
- **index.json 是冗余索引**: 即使丢失，可从各 session 文件重建
- **无并发控制**: 单用户 CLI 工具，不需要锁机制
- **消息序列化**: `AgentMessage` 本身是 JSON-friendly 的，直接 `JSON.stringify`
