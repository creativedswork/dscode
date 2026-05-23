# 贡献指南

感谢你对 dscode 的关注！在提交贡献之前，请花几分钟了解以下内容。

## 理念对齐

dscode 的定位和设计理念与主流 AI Coding Agent 有所不同。在动手之前，请先阅读 **[Introduction.md](docs/Introduction.md)**，重点关注：

- **服务创作者而非开发者**：dscode 的核心是通过 MCP 连接创作工具，而非围绕本地仓库做代码感知。
- **Harness 与模型协同进化**：Harness 是模型的探索环境，功能重心会随模型能力迁移。
- **Agent as OS**：用操作系统的概念理解 Agent 架构——System Prompt 是内核，工具是驱动，MCP 是 USB，Skill 是程序。

确保你的贡献方向与这些理念一致。

## 开发流程

```bash
# 1. Fork 并 Clone
git clone https://github.com/<your-username>/dscode.git
cd dscode

# 2. 安装依赖
npm install

# 3. 配置环境
cp .env.example .env   # 编辑 .env，填入 DEEPSEEK_API_KEY

# 4. 创建分支
git checkout -b feature/your-feature
```

## 基于 OpenSpec 的 SDD 开发

仓库已包含 `openspec/` 目录，推荐在实现中大型功能、交互流程调整或重要重构时，先走 **Spec-Driven Development（SDD）** 流程，再开始编码。

### 推荐流程

1. **先澄清问题和边界**
   - 使用 Claude Code 时，推荐先通过 `/opsx:explore` 或 `openspec-explore` 梳理需求、约束和非目标。
2. **创建变更提案**
   - 推荐使用 `/opsx:propose` 或 `openspec-propose` 自动生成变更骨架。
   - 变更会创建在 `openspec/changes/<change-name>/` 下，通常包含：
     - `proposal.md`：要解决什么问题，为什么要做
     - `design.md`：方案设计与关键权衡
     - `tasks.md`：可执行的实现任务拆分
3. **评审 proposal / design / tasks**
   - 在开始编码前，先确认范围、实现路径和验收标准已经清晰。
4. **按任务实现**
   - 使用 `/opsx:apply` 或 `openspec-apply-change` 按 `tasks.md` 逐步落地。
5. **完成后归档**
   - 变更完成后，可使用 `/opsx:archive` 或 `openspec-archive-change` 归档对应 change。

### 目录约定

- `openspec/specs/`：沉淀长期有效的能力规格。
- `openspec/changes/`：存放尚在推进中的变更提案与实现任务。
- `openspec/config.yaml`：定义当前仓库的 OpenSpec 配置。

### 适用场景

以下情况优先使用 OpenSpec SDD：

- 新增 MCP 能力或跨模块功能
- 调整核心交互流程或权限模型
- 会影响多个文件/多个子系统的重构
- 需要在编码前先对齐方案、边界和验收标准的需求

如果只是小型修复、文案调整或局部重构，可以直接提交代码，不必强制走完整 SDD 流程。

## 测试

项目使用 [Vitest](https://vitest.dev/) 作为测试框架。

```bash
npm test              # 运行全部测试
npm run test:watch    # watch 模式，开发时使用
npm run typecheck     # TypeScript 类型检查
```

### 测试要求

- 提交 PR 前，**所有已有测试必须通过**。
- 新增功能或修复 bug 时，**需要添加对应的单元测试**。测试目录结构与 `src/` 一致，放在 `tests/` 下。
- 如果修改涉及权限模型或 MCP 通信，务必覆盖边界情况。

## 代码风格

- TypeScript 严格模式，类型检查必须通过（`npm run typecheck`）。
- 尽量减少 `as any` 类型断言，优先使用 `pi-ai` 提供的标准类型。
- 不要引入不必要的抽象——三行相似代码好过一个过早的抽象。
- 安全第一：不接受存在命令注入、XSS、路径遍历等漏洞的代码。

## Commit 规范

Commit message 使用英文，格式参考现有提交：

```
<type>: <简短描述>
```

常用 type：`feat`（新功能）、`fix`（修复）、`doc`（文档）、`refactor`（重构）、`test`（测试）。

## PR 流程

1. 确保 `npm test` 和 `npm run typecheck` 全部通过。
2. Push 到你的分支并提交 PR 到 `develop` 分支。
3. PR 标题简洁明了，描述中说明改动动机和实现思路。
4. 如果是新增 MCP 相关功能，请在描述中附上测试用的 MCP Server 信息。

## License

贡献即表示你同意将代码以 MIT 协议授权。
