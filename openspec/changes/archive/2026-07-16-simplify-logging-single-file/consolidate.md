## 变更综述

日志系统从无到有、再到精简的完整演化：最初引入 `Logger` 类替代散落的 `console.*` 调用，按 4 个 channel 分类路由到独立文件；随后修复了 eval 模块 crash 时错误信息不写入日志的问题；最终发现 channel 分类在排查时反而造成 timeline 碎片化和选择困难，且总体量仅 ~1500 行 — 无需多文件。本次变更移除 channel 概念，所有日志合并为单一文件，API 从 `logger.info(channel, tag, msg)` 简化为 `logger.info(tag, msg)`。

## 变更时间线

- 2026-01-16: logging-system — 新建 Logger 类，4 channel 文件日志，替换全局 console.* 调用
- 2026-06-15: fix-eval-progress-and-crash-logging — 修复 eval crash 时错误不写入日志的问题
- 2026-07-16: simplify-logging-single-file — 移除 channel，合并为单文件，简化 API

## 初始设计

**问题**：项目日志散落在各处 `console.log/warn/error` 中，部分污染 TUI 终端，部分写入 `eval.log` 但仅覆盖 eval 模块。缺乏统一的日志基础设施。

**方案**：新增 `src/utils/logger.ts`，提供 `Logger` 类，每个 Agent 实例创建一个实例。四个 channel（`lifecycle`、`session`、`tool`、`analysis`）按语义分类路由到独立文件 `~/.dscode/logs/<channel>.log`。四个 level（`debug`、`info`、`warn`、`error`），每行格式为 `[timestamp] [LEVEL] [channel] [agent_type/agent_id] [tag] message`。替换全部现有 `console.*` 调用。

## 变更记录

_无设计变更。日志系统自初始设计以来核心架构未变。_

## 修复记录

### 修复: Eval crash 日志不写入

- **症状**: `/eval` 在 pipeline 内部 crash 时错误详情（stack trace、上下文）不写入 `eval.log`，问题无法追溯诊断；同时分析期间无进度反馈
- **根因**: `runEval` 的 catch 块未调用日志记录函数
- **修复**: catch 块中添加 `logEval` 调用写入完整错误信息和 stack trace；同时为 causal graph pipeline 添加各 step 进度输出

## 最终状态

**问题**：4 channel 独立文件带来三个实际问题 —
1. Timeline 碎片化：跨 channel 的事件分散在多个文件中，排查需 `cat *.log | sort` 人工重建
2. Channel 边界模糊：同一模块的不同日志调用被迫分属不同 channel，排查时总"选错文件"
3. 维护成本：每次 `logger.info()` 需预判 channel，`LogChannel` 类型需维护，AGENTS.md 需文档化

4 个文件合起来仅 ~1500 行 — 一个终端页面就能看完。`tag` 已提供足够的过滤粒度，channel 是冗余维度。

**方案**：
- 移除 `LogChannel` 类型和 channel 概念，所有日志写入 `~/.dscode/logs/dscode.log`
- API 简化为 `logger.info(tag, msg)` / `clear()`（无参数）
- 日志行格式去 channel 字段：`[ts] [LEVEL] [type/id] [tag] msg`
- 更新所有 ~35 处调用点、3 个 spec、AGENTS.md

**影响范围**：`src/utils/logger.ts`、`src/core/`、`src/session/`、`src/ui/web/`、`src/eval/`、`src/drivers/`（清理 dead import）、`openspec/specs/`、`AGENTS.md`
