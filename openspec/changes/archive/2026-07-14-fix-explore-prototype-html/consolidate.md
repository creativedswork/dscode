## 变更综述

修复 explore 命令中的 prototype 流程与实际工作流脱节的问题。旧流程引用 `prototype.md` 作为输出格式和 `openspec instructions prototype` 作为生成命令，但实践中的工作流（以 session 00MRIZMZQJ 为代表）是先 HTML 原型、再视觉迭代、最后实现。本次变更将工具、约定和文档全部对齐到这个 HTML-first 的实践模式。

## 变更时间线

- 2026-07-14: `fix-explore-prototype-html` — 建立 HTML-first prototype 工作流

## 初始设计

**问题**: explore 命令的 prototype 流程与实际操作脱节——引用不存在的 markdown 原型输出格式和过时的生成命令。

**方案**: 
- 将 prototype 输出从 markdown 改为 HTML，目录统一为 `docs/prototypes/`
- 创建 `docs/prototypes/prototype.md` 作为约束文件，规范命名、样式对齐和所需 skill
- 更新 explore 命令、System Prompt、openspec config 三处文档保持一致

## 变更记录

_无。此为独立变更，非迭代修改。_

## 修复记录

_无。此为工作流规范化变更，非 bug 修复。_

## 最终状态

**问题**: explore 命令的 prototype 流程断裂：引用 `prototype.md` 作为输出格式和 `openspec instructions prototype` 作为生成命令，两者都不反映实际工作流。

**方案**:
- 修复 explore 命令（`.claude/commands/opsx/explore.md` + `.clinerules/workflows/opsx-explore.md`）描述 HTML-first 原型流程
- 修复 System Prompt（AGENTS.md）prototype 部分
- 建立 `docs/prototypes/` 为 HTML 原型文件的规范输出目录
- 创建 `docs/prototypes/prototype.md` 约束文件
- 迁移现有 `mcp-toolcard-execution-view-prototype.html` 到 `docs/prototypes/`
- 更新 `openspec/config.yaml` prototype artifact 描述

**能力**: 新增 `explore-prototype-workflow` — 定义 HTML-first prototype 生成流程，包括检测关键词、生成步骤、输出目录、命名约定和生命周期。

**影响**: explore 命令、System Prompt、openspec config、docs/prototypes/ 目录。
