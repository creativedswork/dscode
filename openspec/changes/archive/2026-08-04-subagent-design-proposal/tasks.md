## 1. 领域模型与运行时抽取

- [x] 1.1 在 `src/agents/` 定义 AgentApplication、Agent、AgentContext、AgentProcessState、AgentExitResult 和 Process Metadata
- [x] 1.2 将 `pi-agent-core.Agent` 导入统一重命名为 `PiAgentRuntime`
- [x] 1.3 定义 AgentProcessRuntime，并实现 PiAgentRuntimeAdapter 与 AgentProcessRuntimeFactory
- [x] 1.4 通过 AgentSupervisor 创建 Main Agent，并为 `Harness.agent` 提供临时兼容 getter
- [x] 1.5 为领域类型和 Main Agent 初始化编写单元测试

## 2. AgentContext 与并发执行环境

- [x] 2.1 实现基于 AsyncLocalStorage 的 `runWithAgentContext` 和 `getAgentContext`
- [x] 2.2 为 Main Agent 初始化 role=main、depth=0 的 AgentContext
- [x] 2.3 修改文件、Shell、Checkpoint 和 Logger 从 AgentContext 读取 agentId 与 cwd
- [x] 2.4 禁止 SubAgent 使用 `process.chdir()`，为路径解析增加并发测试
- [x] 2.5 验证两个不同 cwd 的 Agent 并发运行时文件、日志和 Checkpoint 不串线

## 3. AgentApplication 与 Claude Code 兼容

- [x] 3.1 将唯一 Bundled Agent 移至 `resources/agents/vision.md`，不迁移其他内置角色
- [x] 3.2 从 Vision TypeScript 实现移除角色 Prompt，改由 `vision.md` 提供
- [x] 3.3 修改构建脚本，校验 Bundled Agent.md 并复制到 release staging 的 `dist/resources/agents/`
- [x] 3.4 实现 AgentApplicationRegistry，让 Bundled、dscode 和 Claude 来源共用同一编译链
- [x] 3.5 实现 `.dscode/agents/*.md` 用户级与项目级加载
- [x] 3.6 实现 `.claude/agents/*.md` 用户级与项目级兼容加载
- [x] 3.7 实现 bundled < user compatibility < user dscode < project compatibility < project dscode < managed policy 优先级
- [x] 3.8 从 AgentApplication schema 移除 runtime/entrypoint，所有 Application 统一使用 PiAgentRuntimeAdapter
- [x] 3.9 使用标准 YAML frontmatter 解析和 TypeBox 校验全部来源
- [x] 3.10 实现规范化 Application digest、Registry generation 和原子热更新
- [x] 3.11 实现不可变 Application snapshot，验证运行中配置不随热更新漂移
- [x] 3.12 实现 Claude 工具名到 dscode 工具名的兼容映射
- [x] 3.13 实现 inherit/haiku/sonnet/opus 的可配置模型 alias resolver
- [x] 3.14 实现 default/acceptEdits/plan/bypassPermissions 权限模式编译
- [x] 3.15 实现未知字段、工具、模型和未支持能力的结构化诊断
- [x] 3.16 实现 fallback schema、事件分类、受信任 Handler Registry 和安全诊断
- [x] 3.17 将规范化 fallback 写入不可变 Application snapshot
- [x] 3.18 使用真实 Claude Code Agent 文件建立兼容性 fixture 测试

## 4. AgentSupervisor 与 Process Store

- [x] 4.1 实现 AgentSupervisor 和并发安全 Agent Process Table
- [x] 4.2 实现 agentId 分配、PID/PPID、parentSessionId 与 visibility 规则
- [x] 4.3 实现 created/running/waiting/stopped/exited/failed/killed 状态机
- [x] 4.4 实现版本化 AgentProcessStore、原子保存和项目索引
- [x] 4.5 在 Process Table 与 Store 中保存 Application source、digest、generation 和 snapshot
- [x] 4.6 在 turn_end、状态变化和退出时保存 messages、Usage 与结果
- [x] 4.7 验证 SubAgent 不调用 SessionManager.createSession 且不污染用户 Session 列表
- [x] 4.8 实现 Harness shutdown 的 TERM、超时和 KILL 清理策略

## 5. Foreground 进程工具 MVP

- [x] 5.1 将 `spawn_agent` TypeBox Schema 改为 application + 通用 input 信封，并禁止能力字段覆盖
- [x] 5.2 实现 foreground Application 启动与 AgentExitResult 返回
- [x] 5.3 实现 `list_agents`、`wait_agent` 和 `get_agent_output`
- [x] 5.4 将进程工具注册到 DriverRegistry 和 ToolRegistry
- [x] 5.5 确保 `spawn_agent` 可参与 pi-agent-core parallel tool execution
- [x] 5.6 端到端验证 Main Agent 同轮并行启动两个显式配置的只读 Agent
- [x] 5.7 实现 ContextSelection 判别联合、maxBytes 和 overflow TypeBox Schema
- [x] 5.8 实现 ContextAssembler 的引用校验、确定性解析、快照和 Prompt 注入
- [x] 5.9 测试 selected 非空约束、跨 Session 拒绝、路径边界、预算失败、截断和 capability 不扩张

## 6. Capability 与权限派生

- [x] 6.1 实现父级 hard deny、路径边界、Application 工具和模式限制的 capability compiler
- [x] 6.2 实现 `tools: ["*"]`、显式白名单和 disallowedTools
- [x] 6.3 对内置与 MCP 工具使用同一权限编译路径
- [x] 6.4 默认从 SubAgent 移除 spawn_agent，并实现最大 depth=1
- [x] 6.5 禁止继承父进程 PermissionManager session grants
- [x] 6.6 实现 background ask-to-deny 策略
- [x] 6.7 实现项目配置禁止 bypassPermissions 的安全门禁
- [x] 6.8 为权限单调性和 MCP 不绕过规则编写属性测试

## 7. Background、事件与进程控制

- [x] 7.1 实现 foreground/background attachment，并保证切换时不重启 AgentProcessRuntime
- [x] 7.2 实现 `agent:spawned`、`agent:state`、`agent:progress`、`agent:output`、`agent:exit`
- [x] 7.3 实现 AgentExitResult、实时进度和 AgentProcessStore 输出查询
- [x] 7.4 实现按 parentSessionId 分区的 pending notification queue
- [x] 7.5 在 Main Agent transformContext 的安全点注入退出通知
- [x] 7.6 实现 `send_agent_message` 的 steering/follow-up IPC
- [x] 7.7 实现 `terminate_agent` 协作式 TERM 与 `kill_agent` 强制 KILL
- [x] 7.8 实现 `suspend_agent`/`continue_agent` 的安全边界 STOP/CONT
- [x] 7.9 实现父子进程 visibility 与跨 Session 控制拒绝
- [x] 7.10 增加 TUI/Web 最小进程状态与后台完成显示

## 8. Worktree 与写进程隔离

- [x] 8.1 实现 `.dscode/worktrees/agent-*` Worktree 创建、基线记录和清理
- [x] 8.2 将 Worktree cwd 注入 AgentContext，不修改进程全局 cwd
- [x] 8.3 强制 background 写 Agent 使用 Worktree
- [x] 8.4 隔离 Checkpoint、file version 和 anchor invalidation namespace
- [x] 8.5 实现无变更自动清理、有变更保留和 AgentExitResult 路径返回
- [x] 8.6 验证两个写 Agent 并行修改同一相对路径时主工作区不受污染

## 9. 高级进程能力

- [x] 9.2 实现 per-Application user/project/local Memory 与并发写版本检查

以下能力延期，不属于本次 MVP 归档范围：

- 版本化 checkpoint/restore 与 agentId 恢复语义
- AgentApplication 专属 MCP Server 生命周期
- Claude hooks 到 Agent lifecycle events 的映射
- 显式 Fork、递归防护及 provider 成本/质量 Eval

## 10. Vision SubAgent 验收

- [x] 10.1 修复现有 Pipeline 测试的 ImageCache.get mock，使迁移前 9 个用例恢复通过
- [x] 10.2 删除 VisionPipelineRuntime 和 sealed runtime/entrypoint Registry
- [x] 10.3 让 Vision Agent 通过通用 Factory 创建独立 PiAgentRuntimeAdapter
- [x] 10.4 更新 vision.md：正文作为 systemPrompt，声明 model、空 tools/skills 和 OCR fallback
- [x] 10.5 将 SpawnAgentRequest 改为 application + input 信封，并实现 image/file/text 判别式 Attachment
- [x] 10.6 保证 PiAgentRuntimeAdapter 将 prompt 和 image attachments 直接传给 PiAgentRuntime
- [x] 10.7 将图片缓存、压缩和 ImageRef 解析迁移为通用 Attachment 基础设施
- [x] 10.8 实现 failure classifier、AgentFallbackRegistry 和 OcrFallbackHandler
- [x] 10.9 在 PiAgentRuntime 可恢复失败后、进程终结前运行 fallback，保持 agentId 不变
- [x] 10.10 保留 Main Agent 原生多模态图片直通，不创建 Vision Agent
- [x] 10.11 将用户图片与 MCP 图片入口迁移到通用 SpawnAgentRequest
- [x] 10.12 按 parentSessionId 记录 Vision 与 OCR fallback 结果，不读取 SessionManager.current
- [x] 10.13 编写通用 Runtime 测试，验证 systemPrompt、任务 prompt、图片、model 和空 capability
- [x] 10.14 增加 `npm run test:subagent` 确定性验收命令
- [x] 10.15 重写 Supervisor 集成测试，验证 PiAgentRuntime 成功、OCR fallback、全部失败、PID/PPID、事件和取消
- [x] 10.16 重写用户图片、MCP 图片、Session 切换和原生多模态直通端到端测试
- [x] 10.17 更新 `DSCODE_VISION_E2E=1` smoke test，使其验证真实 Vision PiAgentRuntime
- [x] 10.18 验证测试结束后无 running Vision Agent、OCR worker、Abort listener 或未处理 Promise
- [x] 10.19 删除不再使用的 Pipeline Runtime、Vision 专用模型调用和重复 Prompt 拼装代码

## 11. 验证、文档与迁移

- [x] 11.1 为 Application loader、Supervisor、状态机、Store、IPC、signal 和 notification 编写单元测试
- [x] 11.2 编写 foreground、parallel、background、kill、Session 切换和 Worktree 集成测试
- [x] 11.3 运行 `npm run typecheck`、`npm test` 和 `npm run build`（全量测试保留 23 个既有基线失败）
- [x] 11.4 更新 ARCHITECTURE、README 和 SubAgent 参考文档为 Agent 进程模型
- [x] 11.5 记录 Claude Code 配置兼容矩阵与不支持字段诊断
- [x] 11.6 更新 Bundled Agent.md 编译、资源 manifest、发布包完整性和禁止角色配置硬编码的 CI 测试
- [x] 11.8 增加 `agents.enabled` 回滚开关并验证关闭后保持原单 Agent 行为

Vision 模型升级 Eval 延期，不属于本次 MVP 归档范围。

## 12. 统一资源目录与 npm 发布

- [x] 12.1 创建顶层 `resources/catalog.json`，迁移 vision.md、sandbox.html 和 MDX runtime 作者资源
- [x] 12.2 定义 resource manifest schema，生成 packageVersion、逻辑 ID、mediaType、相对路径、required 和 SHA-256
- [x] 12.3 实现 PackageResourceProvider，通过 `import.meta.url` 精确定位 `dist/resources/manifest.json`
- [x] 12.4 删除 defaultBundledDir 多候选扫描，开发和测试改为显式 resource root 注入
- [x] 12.5 为 Bundled Application 使用稳定 pkg URI，并在 Process Store 保存 packageVersion 和 digest
- [x] 12.6 将 Web、Sandbox、MDX 和 Agent 资源统一组装到 `release/package/dist/resources/`
- [x] 12.7 生成最小 release package.json，将仓库根 package 标记为 private 并禁止根目录发布
- [x] 12.8 实现 `npm pack ./release/package` 的 allowlist、版本、manifest、digest 和体积校验
- [x] 12.9 在临时目录安装 tgz，并从随机 cwd 验证 CLI version 和 Vision Application 加载
- [x] 12.10 修改 GitHub Actions：build job 上传已验证 tgz，publish job 发布同一个 tgz
- [x] 12.11 配置 npm Trusted Publishing/OIDC、id-token 权限和 provenance，保留受控 token 回退
- [x] 12.12 增加缺失资源、digest 篡改、版本不一致、根包误发布和 tarball 污染测试
