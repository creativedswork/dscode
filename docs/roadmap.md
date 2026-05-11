# Roadmap

dscode 的路线图围绕 [Agent as OS](docs/Introduction.md#agent-as-os) 理念展开。核心逻辑来自 Introduction.md 中的三个判断：

1. 模型会吞掉 Harness 的很多功能，**System Prompt 需要收敛并模块化**。
2. Agent 就是 OS，**Sub-Agent 是进程**——Worker、Explorer、Auditor、Scheduler 各司其职。
3. dscode 服务创作者，**MCP 是连接创作工具的 USB**——工具多了需要 Tool Search。

以下按优先级排列，已完成项标记为 [x]。

---

## P0 — 三大核心支柱

决定 dscode 架构骨架的三个能力。

### System Prompt 分层架构

模型正在内化 CoT、Workflow 甚至意图理解，System Prompt 的职责需要收敛到**权限管理**和**工具使用规范**。构建方式必须分层、模块化——每层独立维护，组合注入。

- [ ] **Prompt 模块化框架** — 将 System Prompt 拆分为独立模块（工具规范、权限策略、Skill 指令、项目上下文），启动时按优先级组装
- [ ] **`DSCODE.md` 项目指令** — 自动发现并加载项目根目录的指令文件，作为最低优先级的 Prompt 层
- [ ] **Prompt 版本与 A/B 测试** — 每个模块支持版本标记，可切换组合方案，追踪不同版本的任务完成率
- [ ] **分层覆盖机制** — 用户级 → 项目级 → Session 级，高优先级层覆盖低优先级层，而非简单拼接

### Sub-Agent 子代理系统

Agent as OS 中，Sub Agent 就是进程。OS 的进程分为 Worker、Explorer（Worker 变体）、Auditor、Scheduler——dscode 的 Sub Agent 也需要类似的角色分工。

- [ ] **子代理调度器** — 主 Agent 可派生子代理处理独立子任务，支持并行执行和结果汇总
- [ ] **Explorer Agent** — 只读型子代理，专门用于代码搜索、文件探索，权限受限但速度快
- [ ] **Plan 模式（Scheduler Agent）** — 复杂任务先生成执行计划，经用户确认后逐步执行
- [ ] **Evaluator Agent** — 任务完成后自动评估输出质量，检测明显错误并请求修正
- [ ] **子代理上下文隔离** — 每个子代理拥有独立的上下文窗口，避免污染主对话，返回摘要即可

### MCP Tool Search

MCP Server 多了以后，工具数量爆炸会导致上下文溢出。需要建设 Tool Search Tool，让模型按需检索工具，而非把所有工具塞进 System Prompt——参考 Anthropic 的 [Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)。

- [x] **工具索引注册** — MCP Server 启动时，ToolRegistry 扫描所有 driver，将 MCP 工具标记为 deferred，builtin 工具始终发送
- [x] **工具语义搜索** — `search_tools` 支持关键词评分搜索（名称精确匹配 +10，部分匹配 +5，searchHint +4，描述 +2）和 `select:` 精确选择
- [x] **按需动态加载** — `buildToolsForRequest()` 仅包含已发现的工具；`afterToolCall` 钩子在 search_tools 执行后更新 loop 上下文，下一轮即可调用
- [ ] **工具使用统计** — 记录每个工具的调用频率、成功率、平均耗时，反馈到搜索排序和 Prompt 构建

---

## P1 — 连接性增强

基于 dscode 的创作者定位，强化 MCP 和 Skill 两大连接能力。

- [x] **MCP 协议支持** — Stdio + SSE 双传输，自动 Transport 推断，工具命名空间
- [ ] **Skill 可配置化升级** — SKILL.md 是程序的描述符，支持在 md 中声明 Sub Agent 权限、MCP 工具白名单和 Hooks
- [ ] **外部 Hooks 系统** — 在 config 中配置 before/after tool call 的外部脚本，实现自定义工作流
- [ ] **MCP 连接状态监控** — Server 断连自动告警，支持重连和健康检查
- [ ] **工具权限细粒度控制** — 按 MCP Server 级别控制工具调用权限；部分高敏感工具需 Human in the Loop

---

## P2 — Agent OS 完善

补齐 Agent as OS 架构中其余模块。

- [ ] **任务追踪系统** — 内置 task list，支持多步骤任务的进度跟踪和依赖管理
- [ ] **Git 感知** — 检测 git 状态和分支信息注入上下文；结构化 git 操作工具（commit、diff、PR）
- [ ] **Diff-based 编辑** — 支持 patch/diff 级别的文件修改，替代全文覆写
- [ ] **Diff 驱动的 Permission** — 编辑工具展示 diff 而非全文，permission 确认粒度从文件级细化到 diff 级
- [x] **图片/PDF 读取** — 多模态输入支持（OCR 方式，基于 tesseract.js）
- [ ] **通知系统** — 长任务完成后桌面通知

---

## P3 — 自进化与体验

长期演进方向。

- [ ] **Session 分析** — 结构化记录每次会话的工具调用、成功率、耗时，数据回馈到 Prompt 版本优化和 Tool Search 排序
- [ ] **自动记忆提取** — 从对话中自动提取用户偏好和项目经验，无需手动 `/memory add`
- [ ] **Meta-agent 监督层** — 监督主 Agent 执行，识别重复失败模式并提出改进建议
- [ ] **定时任务** — 支持 cron 式定时触发 Agent 执行
- [ ] **IDE 集成** — VS Code / JetBrains 扩展

---

## 已完成

- [x] **MCP 协议支持** — Stdio + SSE 双传输，兼容 Claude Desktop 配置格式
- [x] **外部 Skill 加载** — 支持从 `~/.dscode/skills/` 和项目级目录动态加载 SKILL.md
- [x] **图片/PDF 读取** — 基于 tesseract.js 的 OCR，支持中英文
