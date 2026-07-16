## Context

当前 Logger 的 core abstraction 是 **channel-based routing** — 四个 channel（`lifecycle`、`session`、`tool`、`analysis`）映射为四个独立文件。这是在 sub-agent 架构预期下设计的，当时的假设是：不同 agent 的不同 channel 需要分开存储以便独立追踪。

实际使用中，sub-agent 架构尚未实现，而 multi-file 设计已经造成了维护负担：1500 行日志分散在 4 个文件，排查时需要手动拼合时间线。

## Goals / Non-Goals

**Goals:**
- 单一日志文件 `~/.dscode/logs/dscode.log`，所有日志追加写入
- 简化 API：`logger.info(tag, msg)` 替代 `logger.info(channel, tag, msg)`
- 简化 clear：`logger.clear()` 替代 `logger.clear(channel)`
- 移除 `LogChannel` 类型和相关导出
- 日志行中去掉 `[channel]` 字段
- 清理 dead imports（4 个文件导入了 Logger 但从未调用）

**Non-Goals:**
- 不改变日志文件的目录位置（仍为 `~/.dscode/logs/`）
- 不实现日志轮转（rotate）— 这是未来的事
- 不改变 TUI 的错误展示路径（`addError` 保留）
- 不改变 level 过滤逻辑
- 不改为异步 I/O（保持 `appendFileSync`）

## Decisions

### D1: 单一文件 `dscode.log`，不是保留多文件但允许跨文件查询

```
Before:
~/.dscode/logs/
├── lifecycle.log
├── session.log
├── tool.log
└── analysis.log

After:
~/.dscode/logs/
└── dscode.log
```

**备选方案**: 保留四文件，但在日志行中添加 correlation ID 方便跨文件 grep。**不采用**，原因：当前总量仅 1500 行的规模，correlation ID 机制比 channel 本身更复杂，不值得。

### D2: 完全移除 channel 参数，不是保留但默认值为单一文件

```typescript
// Before
logger.info("tool", "EventBus", `handler error: ${err}`);

// After
logger.info("EventBus", `handler error: ${err}`);
```

**备选方案**: 保留 channel 参数但将其改为纯 tag（即 `channel` 变成 `tag` 的一个前缀，写入单一文件）。**不采用**，原因：channel 名字本身就是 tag 的冗余复制——`logger.info("tool", "EventBus", msg)` 中 channel `"tool"` 不提供 tag `"EventBus"` 以外的信息。而且 `"analysis"` channel 下 10 个不同的 tag 在查日志时本身就是对 "analysis" 的细分。

### D3: 新的日志行格式

```
Before:
[2026-07-15 08:41:17] [INFO] [tool] [harness/rt_d8c988ea] [web-backend] promptWithImages: ...

After:
[2026-07-15 08:41:17] [INFO] [harness/rt_d8c988ea] [web-backend] promptWithImages: ...
```

去掉 `[channel]` 字段。新的 grep 模式：

```bash
# 老的: cat ~/.dscode/logs/tool.log | grep '\[image-pipeline\]'
# 新的: grep '\[image-pipeline\]' ~/.dscode/logs/dscode.log

# 老的: cat ~/.dscode/logs/analysis.log | grep '\[FocusPipeline\]'
# 新的: grep '\[FocusPipeline\]' ~/.dscode/logs/dscode.log

# 排查完整时间线（新功能，之前做不到）:
# grep diag-tag ~/.dscode/logs/dscode.log   # 一次性看到所有相关日志，按时间排序
```

### D4: `clear()` 无需参数

```typescript
// Before
logger.clear("analysis");  // 清空一个 channel

// After
logger.clear();            // 清空整个日志文件
```

eval pipeline 只使用 `clear("analysis")`，改后变成 `clear()` —— 语义完全等价，因为所有日志都写同一文件。

### D5: 清理 dead imports，不保留

4 个文件导入了 `Logger` 但从未调用其方法：`vision/pipeline.ts`、`vision/cache.ts`、`vision/client.ts`、`edit/tool.ts`。直接删除 import 行。

## Risks / Trade-offs

- **Risk: 日志行中丢失 channel 字段后，无法快速判断日志来自哪个 "category"**
  - **Mitigation**: channel 从未真正提供有效分类（`"tool"` 告诉你的不比 tag `"EventBus"` 多），且 tag 命名已经足够语义化（`SIGINT`、`Save`、`EventBus`、`FocusPipeline`）。

- **Risk: 单一日志文件无限增长**
  - **Mitigation**: 当前总量 ~1500 行。即便增长到万行级别，`grep` 仍然高效。从四个文件合并成一个文件不会让增长问题变得更糟——总量不变，只是位置变了。

- **Risk: sub-agent 架构未来引入后需要回退到多文件**
  - **Mitigation**: sub-agent 引入时，可以在日志行中添加 `[agent_type/agent_id]` 区分（已经存在！），仍用单一文件。如果确实需要不同 agent 的日志隔离，届时可以基于 `agent_id` 字段 split，不需要 channel 概念回来。

- **Risk: 4 个 dead import 文件实际上在别的地方用了 Logger（间接）**
  - **Mitigation**: 检查确认这 4 个文件的 import 是真正未使用的——grep 了所有 `logger.` 调用，这 4 个文件中均无匹配。

## Open Questions

_None._
