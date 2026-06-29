## Why

MCP 配置当前混在 `settings.json` 中，与权限、skills、retry 等偏好设置放在一起。但两者本质不同：

- `settings.json` → **偏好**（dscode 怎么跑）：权限规则、skills 列表、thinking level、retry 策略。项目级 settings 可被 git 管理，团队共享一致的 Agent 行为。
- MCP 配置 → **基建**（项目能调什么工具）：server 地址、认证 token、环境变量。包含敏感信息（API key、内部服务地址），不应进入 git。

混在一起造成两个问题：
1. 团队共享 `settings.json` 时可能泄露 MCP 凭证
2. 用户为了保密不得不把整个 `settings.json` 加入 `.gitignore`，导致偏好配置也无法版本化

## What Changes

- **MCP 配置从 `settings.json` 中分离**：MCP server 配置迁移到独立的 `.mcp.json` 文件
  - `~/.mcp.json` — 用户全局 MCP（所有项目可用）
  - `<project>/.mcp.json` — 项目级 MCP（覆盖同名 server）
- **`settings.json` 中的 MCP 配置进入 deprecated 状态**：兼容期保留读取，但打印 warning 引导用户迁移
- **加载优先级**：`settings.json`（deprecated）→ `~/.mcp.json` → `<project>/.mcp.json`（最高）
- **Web UI 保存行为**：MCP 配置变更写入 `.mcp.json` 而非 `settings.json`
- **文档和 help 文本更新**：CLI help、AGENTS.md 中的示例路径改为 `.mcp.json`
- **推荐的 `.gitignore` 条目**：项目模板中建议将 `.mcp.json` 加入 `.gitignore`

## Capabilities

### Modified Capabilities

- `core-harness`: `loadConfig()` 和 `updateProjectPath()` 的 MCP 配置加载逻辑改为从 `.mcp.json` 读取，settings.json 中的旧路径降级为 fallback

### New Capabilities

- `mcp-dotfile`: MCP server 配置的独立文件格式（`.mcp.json`），定义加载优先级、合并语义、与 settings.json 的兼容策略

## Impact

- `src/core/config.ts` — 新增 `mcpConfigPath()` / `projectMcpPath()`，修改 `loadConfig()` 加载流程
- `src/core/harness.ts` — `updateProjectPath()` 的 MCP 重载改为读取 `.mcp.json`
- `src/ui/commands.ts` — help 文本更新路径
- `src/ui/web/web-backend.ts` — MCP save 写入 `.mcp.json`
- `AGENTS.md` — 配置路径说明更新
- 推荐项目模板 `.gitignore` 增加 `.mcp.json`
- **非破坏性变更**：`.mcp.json` 不存在时 fallback 到 settings.json，现有用户不受影响
