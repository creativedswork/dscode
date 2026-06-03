## Why

当前 dscode 的 session 系统支持持久化对话，但缺乏对话质量诊断能力。用户只能通过 `/session list` 查看标题、时间和消息数等元信息，无法回答"AI 在这个 session 中表现如何？哪里偏离了目标？根因是什么？"等问题。此次变更源自真实案例：Session `00MPX37L8`（湿地面反射场景）中，AI 在 M72 引入了 FakeReflections + WaterPuddleOverlay 导致画面变成"云层+鬼影"，直到 M89 用户投诉才被发现。如果有 `/eval` 自动诊断，此问题可在 M77 截图阶段被提前发现。

## What Changes

- 新增 `/eval` slash command，支持分析指定 session 或当前 session 并生成 HTML 诊断 dashboard
- 新增 session 分析引擎（`src/eval/`），覆盖 Phase 划分、关键词偏离检测、根因推断、改进建议
- Dashboard 自动生成到 `~/.dscode/eval/` 并自动打开浏览器
- `SessionStore` 新增 `loadSessionFile(id)` 公开方法
- `SessionManager` 新增 `getSessionFilePath(idOrPrefix)` 查找方法

## Capabilities

### New Capabilities
- `eval-dashboard`: Session 对话质量诊断分析引擎，包括元数据提取、工具调用统计、Phase 自动划分、关键词偏离检测、根因推断，并生成暗色主题 HTML dashboard 到 `~/.dscode/eval/` 目录

### Modified Capabilities
- `session-management`: SessionStore 新增 `loadSessionFile` 公开方法（读取 session JSON 文件），SessionManager 新增 `getSessionFilePath` 前缀模糊匹配查找方法
- `slash-command-context`: 新增 `eval` command 定义，集成到 `executeSlashCommand` 路由中

## Impact

- **新增文件**: `src/eval/`（分析引擎 + HTML 生成，约 400 行）
- **修改文件**: `src/ui/commands.ts`（新增 eval command，约 30 行）；`src/session/store.ts`（新增公开方法）；`src/session/manager.ts`（新增文件路径查找方法）
- **不影响的系统**: Skills、MCP、Permission、Agent/Harness 核心逻辑、Web UI / TUI 渲染
- **依赖**: Node.js 内置模块（fs, path, os, child_process），无外部依赖
