## 变更综述

从探索模式中建立 HTML 优先的原型工作流，到通过 schema 级别的硬性约束强制执行原型门控——本次变更将原型从"可选约定"升级为"不可绕过的工作流阶段"，确保 explore → propose → apply 的流程不被跳过。

## 变更时间线

- 2026-07-14: `fix-explore-prototype-html` — 修复探索模式的原型流程，建立 HTML 优先的原型生成约定和 `docs/prototypes/` 输出目录
- 2026-07-15: `enforce-prototype-gate` — 通过 schema 硬约束强制执行 prototype 门控，使 prototype 成为 tasks 的依赖项

## 初始设计

探索模式中的原型流程存在断裂：explore 命令引用了不存在的 `prototype.md` 格式和 `openspec instructions prototype` 命令。实际有效的工作流是"先做 HTML 原型，视觉迭代，再实现"，但工具链和约定并未与此对齐。

`fix-explore-prototype-html` 修复了这个问题：
- 将 explore 命令中的原型描述从 markdown 改为 HTML-first
- 建立 `docs/prototypes/` 作为原型 HTML 文件的规范输出目录
- 创建 `docs/prototypes/prototype.md` 约束文件，指定输出目录、命名规范、样式对齐规则
- 定义了新的 capability `explore-prototype-workflow`

## 修复记录

### 修复: explore 原型 HTML 流程修复
- **症状**: explore 命令引用不存在的 `prototype.md` 输出格式和 `openspec instructions prototype` 命令
- **根因**: 工具链文档与实际工作流脱节——实际使用的是 HTML 原型迭代方式，但命令描述仍停留在旧的 markdown 概念
- **修复**: 对齐命令文档（explore.md）、系统提示（AGENTS.md）、config.yaml，建立 `docs/prototypes/` 规范目录和约束文件

## 最终状态

OPSX 工作流中存在缺口：explore 模式可以跳过 propose 直接进入 apply。由于 prototype artifact 在 schema 中标记为"可选，不阻塞 apply"，即使 explore 期间创建了原型 HTML，也没有任何机制强制将其决策带入 change artifacts。

`enforce-prototype-gate` 实现了硬性门控：

- **Schema 硬门控**: `prototype` artifact 从可选改为强制；`tasks.requires` 添加 `prototype` 依赖，CLI 会在 prototype 不存在时阻止任务创建
- **Prototype artifact 语义**: UI 变更时 prototype.md 引用 `docs/prototypes/` 中的 HTML 文件并捕获设计决策；非 UI 变更时写入 2 行存根
- **无条件 explore → propose 流**: explore 命令的"Ending Discovery"部分始终指向 `/opsx:propose`，不再有 `/opsx:apply` 快捷路径
- **Propose 原型感知**: propose 命令新增 step 0，检查 `docs/prototypes/` 中的 HTML 文件并将其纳入 prototype artifact
- **配置对齐**: `openspec/config.yaml` 移除"Prototype does NOT block apply"，反映新的强制状态
- **技能更新**: prototype-workflow 和 openspec-explore 技能对齐新流程
