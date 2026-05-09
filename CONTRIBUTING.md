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
