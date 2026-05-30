# 贡献指南

dscode 是一个**规约驱动开发（SDD）** 的项目，且 dscode 本身就是用 dscode（基于 DeepSeek）开发的——**我们吃自己的狗粮**。在动手之前，请先理解这意味着什么：

> **代码是规约的实现。贡献代码的正确方式是先写好规约，然后让 AI Agent 来生成实现。** 我们不鼓励手动编写实现代码——你写规约，AI 写代码，你来验证。

如果这让你感到陌生，请花 5 分钟读完本文。它很短。

---

## 为什么是 SDD

传统开源贡献流程：fork → 写代码 → 提 PR → reviewer 读代码猜意图 → 来回讨论。

SDD 贡献流程：**写规约 → AI 生成实现 → reviewer 读规约（比读代码快 10 倍）→ 验证实现匹配规约 → 合并**。

规约的优势：
- **意图明确**：规约用场景（Given/When/Then）描述行为，没有歧义
- **评审高效**：reviewer 只需判断"规约对不对"，不用猜"这段代码想干什么"
- **实现一致**：AI 从规约生成的代码风格统一，不会出现个人偏好
- **不会过时**：规约是文档，也是验收标准，代码改了规约没改就会被发现

---

## 快速开始

```bash
# 1. Fork 并 Clone
git clone https://github.com/<your-username>/dscode.git
cd dscode

# 2. 安装依赖
npm install

# 3. 设置 API Key（二选一）
#    方式 A：环境变量
export DEEPSEEK_API_KEY=sk-your-key
#    方式 B：启动后在对话中设置（写入 ~/.dscode/config.json，下次自动读取）
npm start
> /config key sk-your-key

# 4. 验证环境
npm run typecheck
npm test
```

---

### 第一步：确定你要做什么

| 场景 | 从哪里开始 |
|------|-----------|
| 新功能 / 行为变更 | 在 `openspec/changes/` 下创建变更提案 |
| 修复已有功能的 bug | 先检查 `openspec/specs/` 下是否有对应规约，如果有，规约本身可能缺失了边界场景 |
| 文档 / 注释 / 格式修复 | 直接提 PR，不需要走 SDD |
| 探索性想法 / RFC | 在 `openspec/changes/` 下创建 proposal，不需要实现 |

### 第二步：写规约

dscode 内置了 OpenSpec 相关的 Skills。在对话中激活对应 skill，用自然语言描述你的需求即可：

| 你要做什么 | 激活的 Skill | 示例 prompt |
|-----------|-------------|------------|
| 需求探索 & 边界澄清 | `openspec-explore` | "我想给 edit 工具增加一个 dry-run 模式，帮我梳理需求和边界" |
| 创建变更提案 | `openspec-propose` | "帮我为 dry-run 模式创建一个 OpenSpec 变更提案" |
| 按 spec 生成实现 | `openspec-apply-change` | "请按 tasks.md 逐步实现这个变更" |
| 归档已完成的变更 | `openspec-archive-change` | "归档 subagent-design-proposal 这个变更" |

> 如果你使用 Claude Code，对应的 slash commands 是 `/opsx:explore`、`/opsx:propose`、`/opsx:apply`、`/opsx:archive`。dscode 不支持 slash command 方式，请直接用上述 prompt 激活 skill。

`openspec-propose` 会引导你创建一个结构化的变更提案，包含：

```
openspec/changes/<change-name>/
├── proposal.md    # 要解决什么问题，为什么不直接写代码
├── design.md      # 方案设计、关键权衡、替代方案
└── tasks.md       # 可执行的实现任务拆分
```

**规约文件（spec.md）** 长这样：

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

好的规约 = reviewer 读完就能准确判断"这功能对不对"。

### 第三步：生成实现

规约写好后，激活 `openspec-apply-change` skill，用 prompt 触发：

> "请按 tasks.md 逐步实现这个变更"

AI Agent 会按 `tasks.md` 逐步实现，生成代码并自动运行测试。你只需：
1. 检查生成的代码是否与规约一致
2. 确认 `npm test` 和 `npm run typecheck` 全部通过
3. 如果 Agent 的实现有问题，修改规约（不是修改代码），然后重新 apply

### 第四步：提交 PR

PR 必须包含：

```
✔ spec 文件（openspec/specs/ 或 openspec/changes/）
✔ 实现代码（AI Agent 生成）
✔ npm test 通过
✔ npm run typecheck 通过
```

PR 描述中说明：
- 这个变更解决什么问题
- 规约的核心思路（reviewer 会先读规约）
- 如果有 trade-off，在 design.md 中说明

### 第五步：归档（仓库维护者执行）

归档本质是文件重组——将变更提案从 `openspec/changes/` 移入 `archive/`，同步规约到 `openspec/specs/`。**不需要 AI**。

PR 审批通过后，维护者有两种方式归档：

| 方式 | 说明 |
|------|------|
| 手动 | 在 dscode 中激活 `openspec-archive-change` skill，prompt "归档 <change-name>" |
| CI 自动化（推荐） | 维护者配置 GitHub Action，PR 合入到 `develop` 时自动运行归档脚本 |

> 我们计划提供 `npm run archive <change-name>` 脚本，使 CI 流程进一步简化。在此之前，维护者手动归档即可。

---

## 贡献流程（小型修复）

以下情况可以直接提交代码 PR，不需要走完整 SDD：

- 修复拼写错误、格式问题、注释
- 修复测试中明显的错误
- 依赖版本更新（无行为变更）
- 文档更新（如本文件）

但如果你不确定，**默认走 SDD**。多花 10 分钟写规约，省 reviewer 30 分钟猜你的意图。

---

## PR 评审标准

Reviewer 会关注：

| 优先级 | 检查项 |
|--------|--------|
| P0 | 规约是否正确？是否覆盖了边界情况？ |
| P0 | 实现是否忠实于规约？ |
| P1 | 是否有安全漏洞（命令注入、路径遍历、XSS）？ |
| P1 | 是否引入了不必要的抽象或复杂度？ |
| P2 | 代码风格是否一致？ |
| P2 | 是否有足够的测试覆盖？ |

如果你走了 SDD 流程，P2 基本不用关心——AI Agent 生成的代码风格是统一的。

---

## 测试

```bash
npm test              # 运行全部测试
npm run typecheck     # TypeScript 类型检查
```

- 已有测试必须在 PR 中全部通过
- 新规约通常会自动添加测试——检查 Agent 是否完成了这一步
- 测试目录结构与 `src/` 一致，放在 `tests/` 下

---

## 代码风格

TypeScript strict，详见 [STYLE.md](docs/STYLE.md)。AI Agent 会自动遵循，你不需要刻意记忆。

几个硬约束：
- 禁止 `any`（除非边界适配层无可避免）
- 安全第一：不接受存在命令注入、XSS、路径遍历的代码
- 不引入不必要的抽象

---

## Commit 规范

Commit message 使用英文：

```
<type>: <简短描述>
```

| type | 使用场景 |
|------|---------|
| `feat` | 新功能 / 新规约实现 |
| `fix` | Bug 修复 |
| `docs` | 文档变更 |
| `spec` | 纯规约变更（无实现代码改动） |
| `refactor` | 重构（无行为变更） |
| `test` | 测试补充 |
| `chore` | 构建、依赖、工具链 |

---

## License

贡献即表示你同意将代码以 MIT 协议授权。
