# ConfigWatch 设计文档

## 1. 架构对比

```
当前（两套机制）                      改造后（统一 ConfigWatch）

TUI                              TUI
 ctx.config ──共享引用──┐          deps.config ◄── 仍可读（向后兼容）
                         │            ▲
 harness.config ◄────────┘            │ mutate + notify
        │                             │
        │ mutate                ┌─────┴──────────────┐
        ▼                       │   ConfigWatch       │
Web Backend                      │                     │
 this.config ──手工 emit──→ WS   │ setModelConfig()    │
        │                  │    │ setApiKey()         │
        │ mutate            │    │ setProjectPath()    │
        ▼                   │    │ setVision()         │
  buildConfigData() ──→ 漏了→❌  │ setMcpServers()     │
                                │ onChange(fn) → ()   │
                                │ get()               │
                                └──────┬──────────────┘
                                       │ onChange 通知
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                     TuiBackend  WebUiBackend   （未来扩展）
                     （重读 config）（broadcast）
```

## 2. ConfigWatch API

```ts
// src/core/config-watch.ts

export class ConfigWatch {
  private listeners = new Set<(config: HarnessConfig) => void>();

  constructor(private config: HarnessConfig) {}

  /** 不可变快照（只读类型，防止外部意外 mutate） */
  get(): Readonly<HarnessConfig> {
    return this.config;
  }

  /** 订阅配置变更，返回取消函数 */
  onChange(fn: (config: HarnessConfig) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ── 领域方法 ──

  /** 设置 provider + modelId + thinkingLevel（三者通常联动变更） */
  setModelConfig(provider: string, modelId: string, thinkingLevel: ThinkingLevel): void {
    this.config.provider = provider;
    this.config.modelId = modelId;
    this.config.thinkingLevel = thinkingLevel;
    this.emit();
  }

  /** 单独设置 thinkingLevel（不改变 provider/modelId） */
  setThinkingLevel(level: ThinkingLevel): void {
    this.config.thinkingLevel = level;
    this.emit();
  }

  /** 设置 API key */
  setApiKey(key: string): void {
    this.config.apiKey = key;
    this.emit();
  }

  /** 设置项目路径（触发 session/memory/skills/MCP 全部重载） */
  setProjectPath(path: string): void {
    this.config.projectPath = path;
    this.emit();
  }

  /** 设置 Vision 配置（整体替换） */
  setVision(vision: VisionConfig | undefined): void {
    this.config.vision = vision;
    this.emit();
  }

  /** 更新 Vision 部分字段 */
  updateVision(patch: Partial<VisionConfig>): void {
    this.config.vision = this.config.vision
      ? { ...this.config.vision, ...patch }
      : patch as VisionConfig;
    this.emit();
  }

  /** 设置 MCP 服务器列表 */
  setMcpServers(servers: MCPServerConfig[]): void {
    this.config.mcp = servers;
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) {
      fn(this.config);
    }
  }
}
```

## 3. 方法 ↔ 调用点映射

```
ConfigWatch 方法            调用位置                      替代的旧代码

setModelConfig()      ┌─ harness.setProvider()        this.config.provider = id
                      │                                this.config.modelId = id
                      │                                this.config.thinkingLevel = level
                      │
                      └─ harness.setModel()           this.config.modelId = id

setThinkingLevel()    ── harness.setThinking()         this.config.thinkingLevel = level

setApiKey()           ┌─ web-backend handleConfig      this.config.apiKey = cmd.value
                      │   ("set_key")
                      └─ commands /config key          ctx.config.apiKey = key

setProjectPath()      ── harness.updateProjectPath()   this.config.projectPath = path

setVision()           ┌─ web-backend handleConfig      this.config.vision = {...}
                      │   ("set_vision_delete")
                      │
updateVision()        ┤─ web-backend handleConfig      this.config.vision = {...}
                      │   ("set_vision_provider"
                      │    "set_vision_model"
                      │    "set_vision_key")
                      │
                      └─ commands /config vision-*     ctx.config.vision = v

setMcpServers()       ── harness.initMcpManager()      this.config.mcp = mcpServers
```

## 4. UiBackend 接口扩展

```ts
// src/ui/backend.ts — 新增
export interface UiBackend {
  // ... 现有方法 ...

  /** 订阅配置变更回调（可选）。
   *  Harness 在 ConfigWatch 变更时调用。
   *  TuiBackend：刷新 deps.config 引用 / 重新渲染需要 config 的 UI
   *  WebUiBackend：broadcast config 事件到前端 */
  onConfigChange?(): void;
}
```

## 5. 各组件集成

### 5.1 Harness（src/core/harness.ts）

```ts
export class Harness {
  configStore: ConfigWatch;
  config: HarnessConfig;  // ← 保持兼容引用，指向 store 内部对象

  constructor(rawConfig: HarnessConfig) {
    this.configStore = new ConfigWatch(rawConfig);
    this.config = this.configStore.get() as HarnessConfig; // 内部引用，store 的 mutate 会直接改它
    // ...
  }
}
```

关键点：`this.config` 仍然是 `ConfigWatch` 内部的同一个对象引用，所以现有的 `this.config.projectPath` 读取代码不需要改动。只有 mutation 需要改成走 `configStore.set*()`。

```ts
// 旧
this.config.projectPath = resolvedPath;

// 新
this.configStore.setProjectPath(resolvedPath);

// 旧
this.config.provider = providerId;
this.config.modelId = defaultModelId;
this.config.thinkingLevel = getThinkingLevel(providerId, defaultModelId);

// 新
this.configStore.setModelConfig(providerId, defaultModelId, getThinkingLevel(...));
```

Harness.run() 初始化时注册 UI 回调：
```ts
// harness.run() 中
this.ui.onConfigChange?.();
// ConfigWatch 变更 → Harness 调用 → UiBackend 收到通知
this.configStore.onChange(() => {
  this.ui.onConfigChange?.();
});
```

### 5.2 WebUiBackend（src/ui/web/web-backend.ts）

```ts
// 构造函数接收 ConfigWatch
constructor(options: WebUiOptions) {
  this.configStore = options.configStore;
  this.config = this.configStore.get() as HarnessConfig;
}

// 实现 onConfigChange
onConfigChange(): void {
  this.broadcast({ type: "config", data: this.buildConfigData() });
}

// handleConfig 中各 set 改用 ConfigWatch
case "set_key":
  this.configStore.setApiKey(cmd.value);
  // ... 后续 key 分发逻辑 ...

case "set_provider":
  this.configStore.setModelConfig(cmd.value, cd.models[0].id, defaultLevel);
  // ...

case "set_project_path":
  const result = await (this.harness as any).updateProjectPath(cwd);
  // updateProjectPath 内部已调用 configStore.setProjectPath()
  // onChange 自动触发 onConfigChange → broadcast
```

### 5.3 commands.ts（src/ui/commands.ts）

`ctx.config` 仍然是 `ConfigWatch` 的内部对象引用，可直接读取。但 mutation 改用 `ctx.configStore.*`：

```ts
// 旧
ctx.config.apiKey = key;

// 新
ctx.configStore.setApiKey(key);

// 旧
ctx.config.vision = v;

// 新
ctx.configStore.setVision(v);
// 或局部更新:
ctx.configStore.updateVision({ provider: vp });
```

### 5.4 TuiApp（src/ui/tui-app.ts）

TuiDeps 新增 `configStore` 字段。TuiBackend 实现 `onConfigChange` 为空操作（`deps.config` 是共享引用，已自动同步），但保留接口以备未来需要刷新 UI。

```ts
export interface TuiDeps {
  // ...
  config: HarnessConfig;   // 保持兼容
  configStore: ConfigWatch; // 新增（供 commands.ts 等使用）
}

// TuiBackend
onConfigChange(): void {
  // TUI 中 deps.config 是 ConfigWatch 内部引用，自动同步
  // 无需额外操作
}
```

### 5.5 Web 前端（web/src/components/App.tsx）

```tsx
// 新增缺失的 case
case "config": {
  setConfig(event.data);
  break;
}
```

## 6. 数据流总览

```
用户操作                     ConfigWatch                  UI 通知
────────                    ──────────                  ──────

Web: Set Project Path
  → ws.send({config,         setProjectPath(path)       onChange
     set_project_path})          │                          │
                                 │ mutate config            │
TUI: /config cwd <path>          │                         ├──→ TuiBackend.onConfigChange()
  → ctx.onSetCwd(cwd)            │                         │      (no-op, 共享引用)
  → harness.updateProjectPath()  │                         │
     → configStore.setProjectPath()                        └──→ WebUiBackend.onConfigChange()
                                                                  → broadcast({type:"config"})
Web: Sidebar set API Key                                           → App.tsx case "config"
  → ws.send({config,           setApiKey(key)                     → setConfig(event.data)
     set_key})                    │                               → Sidebar 刷新
                                  │
TUI: /config key <key>           │
  → commands.ts                  │
     → configStore.setApiKey()   │
```

## 7. 风险与边界

- **兼容性**：`this.config` 保持为 `HarnessConfig` 类型，所有只读访问无需改动
- **并发**：ConfigWatch 在单线程 Node.js 环境下无并发问题
- **测试**：ConfigWatch 纯逻辑单元，可独立单测
- **回滚**：如果出问题，只需恢复 mutation 点的改动，不影响读取路径
