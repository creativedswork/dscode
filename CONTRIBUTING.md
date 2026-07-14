# 贡献指南

dscode 是一个**规约驱动开发（SDD）** 的项目，且 dscode 本身就是用 dscode（基于 DeepSeek）开发的——**我们吃自己的狗粮**。

> **代码是规约的实现。** 所有功能从 spec 开始，由 AI Agent 生成实现，开发者验证。

---

## 当前状态

**dscode 目前是单人 SDD 开发项目，暂不接受直接的代码贡献（Pull Request）。**

SDD 驱动的多人协作尚不成熟——spec 文件的合并冲突、过期的任务产物、并行的变更提案会产生大量协调开销。在 SDD 工具链成熟之前，单人开发是最高效的方式。

如果你对项目感兴趣，请跳到 [参与方式](#参与方式)。

---

## 这个仓库如何运作

### 为什么是 SDD

传统开发流程：想清楚 → 写代码 → reviewer 读代码猜意图 → 来回讨论。

SDD 流程：**写规约 → AI 生成实现 → 验证实现匹配规约 → 完成**。

规约的优势：
- **意图明确**：规约用场景（Given/When/Then）描述行为，没有歧义
- **评审高效**：只需判断"规约对不对"，不用猜"这段代码想干什么"
- **实现一致**：AI 从规约生成的代码风格统一，不会出现个人偏好
- **不会过时**：规约是文档，也是验收标准，代码改了规约没改就会被发现

### SDD 管线

```
想法 → 提案 (proposal.md) → 设计 (design.md) → 规约 (specs/) → 任务 (tasks.md) → AI 实现 → 归档
```

dscode 内置了 OpenSpec 相关的 Skills：

| 阶段 | Skill | 说明 |
|------|-------|------|
| 需求探索 | `openspec-explore` | 梳理需求边界 |
| 创建提案 | `openspec-propose` | 生成 proposal / design / specs / tasks |
| 生成实现 | `openspec-apply-change` | 按 tasks.md 逐步生成代码 |
| 归档变更 | `openspec-archive-change` | 移入 archive，同步 specs |

如果你使用 Claude Code，对应的 slash commands 是 `/opsx:explore`、`/opsx:propose`、`/opsx:apply`、`/opsx:archive`。

### 规约示例

```markdown
## Purpose
简要说明这个能力做什么。

## Requirements
### Requirement: 功能名称
描述行为。

#### Scenario: 正常情况
- **WHEN** 用户执行某操作
- **THEN** 系统应当如何响应

#### Scenario: 边界情况
- **WHEN** 输入为空
- **THEN** 系统应当优雅处理
```

好的规约 = 读完就能准确判断"这功能对不对"。

---

## 参与方式

虽然不接受代码 PR，但我们非常欢迎以下形式的参与：

- **[GitHub Issues](https://github.com/creativedswork/dscode/issues)**：提交 bug 报告、功能建议、改进想法
- **讨论**：参与 Issues 中的技术讨论，帮助完善需求和边界场景
- **MCP Server**：为创作工具开发 MCP Server（Blender、Unreal、Figma 等），dscode 会自动发现并接入

SDD 工具链成熟后，我们会重新开放代码贡献。届时本文件会更新为完整的贡献流程。
