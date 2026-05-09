# Roadmap

## P0 — 核心能力

- [ ] **Diff-based 编辑工具** — 支持 patch/diff 级别的文件修改，替代全文覆写
- [ ] **项目指令文件（DSCODE.md）** — 自动加载项目根目录的指令到 system prompt，无需手动 /memory add
- [ ] **Sub-agent 子代理** — 支持并行派生子 agent 处理复杂子任务
- [ ] **自动记忆提取** — 实现 `autoExtract`，从对话中自动提取偏好和经验
- [ ] **System prompt 自进化** — 根据用户反馈和任务结果动态调整 system prompt

## P1 — 开发者体验

- [ ] **Git 感知** — 自动检测 git 状态、分支信息注入上下文；结构化 git 工具（commit、diff、PR）
- [x] **MCP 协议支持** — 作为 MCP client 连接外部工具服务器，动态扩展能力
- [ ] **外部 Hooks 系统** — 支持在 config 中配置 before/after tool call 的外部脚本
- [ ] **Plan 模式** — 复杂任务先生成计划并经用户确认后再执行
- [ ] **任务追踪** — 内置 task list，支持多步骤进度跟踪和依赖管理

## P2 — 自进化机制

- [ ] **Session 分析** — 结构化记录每次会话的工具调用、成功率、耗时，用于后续进化决策
- [ ] **输出质量自评估** — 任务完成后自动评估输出质量，反馈到记忆系统
- [ ] **技能自生成** — 识别能力缺口，自动生成新 skill 定义并注册
- [ ] **Prompt 变异引擎** — prompt 版本管理、A/B 测试、效果度量、自动择优
- [ ] **Meta-agent 监督层** — 监督主 agent 执行，识别失败模式并提出改进

## P3 — 扩展功能

- [ ] **Web 搜索/抓取** — 内置 web search 和 URL fetch 工具
- [x] **图片/PDF 读取** — 多模态输入支持（OCR 方式，基于 tesseract.js）
- [ ] **通知系统** — 长任务完成后桌面通知
- [ ] **定时任务** — 支持 cron 式定时执行
- [ ] **IDE 集成** — VS Code / JetBrains 扩展
- [ ] **实际 token 用量追踪** — 从 API 响应中读取真实 usage，计算成本
- [x] **外部 Skill 加载** — 支持从 `~/.dscode/skills/` 和项目级目录动态加载声明式技能（SKILL.md）
