## 变更综述

Session Dashboard 最初作为通用 Artifact 系统的首个 consumer，为 Main Agent
Session 提供 Token、工具调用和耗时可视化；随后加入基于消息内容哈希的本地缓存，
减少重复生成。SubAgent 架构落地后，`agentMessages` 已能在 Chat 与 TUI 中恢复为
Agent Activity，但 Dashboard 摘要和缓存身份仍只认识 Main messages。本次变更补齐
这一缺口：保留全部既有指标，增量加入 SubAgent 聚合与执行记录，并让 Agent 终态变化
可靠地使旧 Dashboard 缓存失效。

## 变更时间线

- 2025-01-21: `session-dashboard` — 建立 Artifact 协议、Chat/Dashboard 切换和基于 Session 摘要的 HTML Dashboard。
- 2026-06-23: `session-dashboard-cache` — 按 Session `contentHash` 缓存 Dashboard，避免内容未变化时重复调用 LLM。
- 2026-08-04: `show-subagents-in-conversation` — 将 `agentMessages` 投影为 Web/TUI 可恢复的 Agent Activity。
- 2026-08-04: `include-subagents-in-session-dashboard` — 将 SubAgent 指标和记录加入 Dashboard，并扩展缓存哈希。

## 初始设计

最初的 Session Dashboard 解决 Web UI 只有消息流、缺少 Session 资源与执行概览的
问题。后端从 Main Agent Session 构造 Token 用量、工具调用统计和耗时摘要，通过独立
LLM 调用生成自包含 HTML，并在 sandbox iframe 中渲染。Dashboard 更新采用纯指令
模式，不写入主对话历史，也不阻塞 Main Agent。

## 变更记录

### 变更: 引入按 Session 内容校验的 Dashboard 缓存
- **触发**: Session 切换后可能继续展示旧 Dashboard，且重复进入 Dashboard 会产生不必要的 LLM 调用。
- **改动**: 新增 `contentHash`，前端按 Session ID 和 hash 缓存 HTML；命中时即时渲染，失配时重新生成。
- **影响**: Session metadata、Web SessionInfo、App localStorage 缓存与视图切换逻辑。

### 变更: SubAgent 执行进入共享对话视图
- **触发**: SubAgent 已成为独立 Process，但 UI 只能看到退出 toast。
- **改动**: 从 Session v3 `agentMessages` 构建 canonical Agent Activity，在 Web/TUI 中展示状态、Application、耗时和摘要。
- **影响**: 共享 conversation model、Session 历史重建、Web/TUI 展示；Main 推理上下文与完整 Process transcript 继续隔离。

### 变更: Dashboard 纳入 SubAgent 执行维度
- **触发**: Chat/TUI 已显示 Agent Activity，而 Dashboard 仍只统计 Main Agent，导致同一 Session 的两个视图语义不一致。
- **改动**: Dashboard summary 增加 SubAgent 总数、终态分布、成功率、Application 分布、委派时长和有界执行记录；生成提示要求 Agent headline、Processes、失败态和空态。
- **影响**: Web Dashboard 摘要与 prompt，不改变 Artifact 协议或 Session v3 格式。

### 变更: Agent Processes 收敛为概览
- **触发**: 240/360 字符的 Input/Result 摘要仍会让 Dashboard 看起来像在复制 SubAgent 会话详情。
- **改动**: 改为 100/120 字符的单句 task/outcome summary，并禁止 Input/Result 块、完整原文、多段内容和详情展开。
- **影响**: Dashboard 只承担执行概览；完整 SubAgent 内容继续由 Chat Agent Activity 承载。缓存格式版本提升，旧详细 Dashboard 自动失效。

## 修复记录

### 修复: SubAgent 完成后 Dashboard 缓存不失效
- **症状**: Main messages 未变化时，后台 SubAgent 完成后再次打开 Dashboard 仍命中旧 HTML。
- **根因**: `SessionMetadata.contentHash` 仅由 Main messages 计算，没有覆盖 `agentMessages`。
- **修复**: 使用统一纯函数对 Main messages 和稳定排序的 Agent 投影计算 hash，并同时用于当前 Session 保存、非当前 Session Agent upsert 和 legacy Vision 追加。

## 最终状态

- Session Dashboard 保留 Token 分类、Context pressure、Main 工具统计、Top Tools、
  Session active time、Turn count 和平均 Turn 时长等全部既有指标。
- Dashboard 新增 SubAgent 总数、成功率、终态计数、Application 分布和 Delegated
  time，并展示按创建时间排序的 Agent Processes 记录。
- 每条 Agent 记录包含六位短 ID、Application、状态、耗时、单句任务摘要以及
  单句结果摘要；失败状态同时使用语义颜色和文本。
- Dashboard 不展示 Input/Result transcript、完整 SubAgent 原文、多段内容或详情展开；
  完整内容仅保留在 Chat Agent Activity。
- 无 SubAgent 的 Session 显示明确的 Main-Agent-only 空态。
- Main 工具/Token 指标与 SubAgent 指标保持独立，不读取完整 Agent Process transcript，
  不向 `agent.state.messages` 注入 Agent 数据。
- Dashboard `contentHash` 同时覆盖 Main messages 与持久化 Agent records，当前和后台
  Session 的 Agent 终态变化都会使旧缓存失效。
- Dashboard cache entry 带格式版本，升级前生成的详细 Agent HTML 会强制重新生成。
- WebSocket 协议、Session v3 数据结构和 Agent Process Store 均保持兼容。
