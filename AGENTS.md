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
npm run build:web      # 构建前端（npm start 前需先执行）
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


## 配置文件

- `~/.dscode/settings.json` — 用户偏好（权限、skills、retry），可版本管理
- `<project>/.dscode/settings.json` — 项目偏好，覆盖用户设置
- `~/.mcp.json` — 用户全局 MCP servers，包含敏感信息不提交
- `<project>/.mcp.json` — 项目 MCP servers，应加入 `.gitignore`
