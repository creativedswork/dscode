## Context

当前项目没有任何统一的日志基础设施。约 40 处 `console.log/warn/error` 调用散落在 `core/`、`session/`、`eval/`、`drivers/` 中，直接输出到终端 stderr/stdout。唯一的日志文件是 `eval/logger.ts` 写入的 `~/.dscode/logs/eval.log`，仅覆盖 eval 模块。

sub-agent 架构即将引入，需要一套按 Agent 实例组织的日志系统。

## Goals / Non-Goals

**Goals:**
- 每个 Agent 实例拥有独立的 Logger，所有 channel 共享同一 agent 身份
- 四个 channel：`lifecycle`、`session`、`tool`、`analysis`
- 四个 level：`debug`、`info`、`warn`、`error`
- 所有日志只写文件（`~/.dscode/logs/<channel>.log`），终端零输出
- 替换全部现有 `console.*` 日志调用

**Non-Goals:**
- 不实现日志轮转（rotate）
- 不实现远程日志传输
- 不改变 TUI 的错误展示（`ui.addError` 保留）
- 不在终端回显日志（crash 除外，通过 `addError` 走 TUI）

## Decisions

### 1. Logger 按 Agent 实例创建，不按模块

```
harness Logger   ←  new Logger({ type: "harness", id: "rt_a1b2" })
  └── channel 参数由调用方在每次写日志时指定

eval Logger      ←  new Logger({ type: "harness", id: "rt_a1b2" })
  └── 暂用 harness type/id，未来变为 { type: "eval", id: "..." }
```

**备选方案**：全局单例 Logger，各模块通过 `Logger.create(channel)` 获取。**不采用**，原因：无法区分不同 Agent 实例（未来 sub-agent 无法独立追踪）。

### 2. Channel 作为写日志时的参数，不是创建时的绑定

```typescript
logger.info("session", "Save", "trySaveSession failed");
logger.error("tool", "AgentEvent", `handler error: ${err}`);
```

**备选方案**：`Logger.create(channel)` 返回绑定 channel 的 Logger。**不采用**，原因：同一模块（如 `harness.ts`）会写多个 channel（`tool`、`session` 等），预绑定会创建多个 Logger 实例，增加复杂度。

### 3. 每行日志格式

```
[2026-06-16 12:00:01] [INFO] [analysis] [harness/rt_a1b2] [Phase0] Library: 42 files
   timestamp         level   channel    agent_type/id     tag     message
```

- `timestamp`：ISO 格式，精确到秒（不带毫秒和时区，保持可读且简洁）
- `tag`：语义标签，用于 grep/过滤，如 `Phase0`、`Save`、`AgentEvent`
- `agent_type/id`：由 Logger 构造时注入，每行自动附加

### 4. 删除 ProgressDisplay 的 ANSI 终端渲染

`ProgressDisplay` 当前有两种输出路径：
- `onLog` 回调 → TUI `addInfo`（保留）
- `process.stdout.write` / `console.log` → 终端 ANSI 进度条和完成框（删除）

ANSI 渲染在 TUI 模式下与 TUI 显示冲突，在 web 模式下无终端可写。进度信息改为：
- TUI 面板：通过 `onLog` 推送（仅 `addInfo`，不加 `console.error`）
- 文件日志：通过 `Logger("analysis")` 写入 `~/.dscode/logs/analysis.log`

### 5. eval pipeline Logger 创建

eval pipeline 在 `eval/index.ts` 中创建自己的 Logger 实例（而非接收外部传入），agent type 暂用 `"harness"`：

```typescript
const evalLogger = new Logger({ type: "harness", id: runtimeId });
```

`runtimeId` 通过一个全局可访问的方式获取——在 `main.ts` 中生成并 store 到 `process.env.DSCODE_RUNTIME_ID` 或类似的轻量传递机制。未来 sub-agent 化后改一行构造函数即可。

## Risks / Trade-offs

- **[日志文件无限增长]** → 当前不实现 rotate，后续可加。eval 命令每次开始时会 `clear()` analysis 日志。其他 channel 日志体量小。
- **[sync I/O 阻塞]** → `appendFileSync` 可能在高频日志时阻塞 event loop。当前日志频率低（eval pipeline 数百条/次，其他 channel 偶发），可接受。后续可改为 async + buffer。
- **[runtimeId 传递]** → eval 模块需要 runtimeId 创建 Logger，需引入轻量传递机制（如 `process.env` 或全局 ref）。未来可改为 Agent 自身持有 Logger。
- **[ProgressDisplay 删除终端渲染影响 CLI standalone 模式]** → 当前 ProgressDisplay 的 ANSI 渲染只在非 web 模式下生效，但 dscode 的非 web 模式是 TUI，同样冲突。无实际使用场景受损。

## Open Questions

- runtimeId 传递机制：`process.env` vs 全局变量 vs HarnessAPI 暴露
- `debug` level 的默认启用策略：始终全量记录 vs 环境变量控制
