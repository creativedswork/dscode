# AGENTS.md

本文件供 AI Agent 快速理解项目结构。


## 编码规范

- TypeScript strict，2 spaces，semicolons，named exports，camelCase
- 文件 ≤300 行，一个文件一个职责
- 详见 `docs/STYLE.md`

## 图像识别

支持 Vision 模型代理和 OCR 识别图片。**不要以"我是文本模型"为由拒绝处理图片。**

## Web 前端

修改 Web UI 前必读 `openspec/specs/web-frontend/spec.md` 和 taste-skill，禁止引入第三方设计体系。

## 运行

```bash
npm start              # REPL
npm start -- --web     # Web 模式
npm run build          # 构建 (npm start 前需先执行)
npm run typecheck      # 类型检查
npm test               # 测试
```

## 自定义模型

dscode 在 `src/models/registry.ts` 模块初始化时，通过 pi-ai 的 `createProvider()` + `models.setProvider()` 注册非 pi-ai builtin 的模型提供商。

当前注册的自定义 provider：
- **qwen** (DashScope) — 定义在 `src/models/qwen.ts`，baseUrl `https://dashscope.aliyuncs.com/compatible-mode/v1`

**⚠️ 升级 pi-ai 时请确认**：
1. `createProvider` / `envApiKeyAuth` / `lazyApi` 仍从 `@earendil-works/pi-ai` 可导入
2. Qwen 模型的 `compat.thinkingFormat: "qwen"` 兼容新版本（pi-ai 0.80.3+ 支持）
3. 模型定义的 `Omit<Model<Api>, "id" | "name">` 类型仍然兼容 pi-ai 的 `Model` 类型

添加新自定义 provider 的模式：
1. 在 `src/models/` 下创建 `<provider>.ts`，导出 model map 和 baseUrl
2. 在 `registry.ts` 中用 `createProvider()` 构造 Provider
3. 调用 `models.setProvider()` 注册 ⚠️ 光注册到 dscode 自己的 Map 不够，必须注册到 pi-ai 实例

## MCP 命名规范

MCP tool/driver name 必须使用 `src/mcp/names.ts` 中的工具函数构造，**禁止手动拼接字符串**。

```
mcpToolName("github", "search_repos") → "mcp__github__search_repos"
mcpDriverName("github")             → "mcp__github"
isMcpToolName(name)                  → boolean
```

分隔符固定为双下划线 `__`（`mcp__<server>__<tool>`），不是单下划线。
手动拼接容易写出 `` `mcp__${server}_${tool}` `` 导致 reducer 匹配失败。


## 配置文件

- `~/.dscode/settings.json` — 用户偏好（权限、skills、retry），可版本管理
- `<project>/.dscode/settings.json` — 项目偏好，覆盖用户设置
- `~/.mcp.json` — 用户全局 MCP servers，包含敏感信息不提交
- `<project>/.mcp.json` — 项目 MCP servers，应加入 `.gitignore`

## Command & Skill File Priority

Commands and skills may coexist in three locations: `.dscode/`, `.clinerules/`, `.claude/`.

- **`.dscode/commands/` / `.dscode/skills/` is the canonical source**
- **`.clinerules/` and `.claude/` are sync copies**
- When modifying commands or skills, **must update all three locations**, with `.dscode/` as the authority
- When searching for command definitions, **read `.dscode/` first** — do not stop at `.clinerules/` or `.claude/`

## 日志排查

当需要追踪运行时执行路径时，使用项目内置的 Logger（**禁止 `console.log`**，TUI 独占终端，stdout 不可见）。

### Logger API

日志写入 `~/.dscode/logs/<channel>.log`，支持 channel：`lifecycle | session | tool | analysis`。

| 位置 | 调用方式 |
|------|---------|
| `tui-app.ts` / `web-backend.ts` | `this.deps.logger.info("tool", "diag-tag", \`msg...\`)` |
| `commands.ts` | `ctx.harness.logger.info("tool", "diag-tag", \`msg...\`)` |
| `harness.ts` | `this.logger.info("tool", "diag-tag", \`msg...\`)` |

### 操作流程

```bash
# 1. 清空旧日志
> ~/.dscode/logs/tool.log

# 2. 启动并触发目标行为
npm start

# 3. 查看
cat ~/.dscode/logs/tool.log | grep diag-tag
```

### 注意事项

- 排查完毕后**删除诊断日志**，避免污染代码和日志文件
- 添加日志后运行 `npm run typecheck` 确保编译通过
- 标签（diag-tag）用有意义的名称，方便 grep 过滤
- 必要时在关键分支的入口和出口**都加日志**，而不是只加一处
