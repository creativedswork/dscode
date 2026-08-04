# vision-subagent-acceptance Specification

## Purpose
TBD - created by archiving change subagent-design-proposal. Update Purpose after archive.
## Requirements
### Requirement: Bundled Vision Application

系统 SHALL 提供 `resources/agents/vision.md`。Vision SHALL 使用默认 Agent runtime，不得声明 PipelineRuntime 或内部 entrypoint。

#### Scenario: 编译 Vision Application
- **WHEN** AgentApplicationRegistry 加载 Bundled vision.md
- **THEN** 编译结果包含 systemPrompt、model、空 capability、fallback、source、digest 和 generation

### Requirement: Vision 使用通用 PiAgentRuntime

AgentSupervisor SHALL 创建 Vision AgentProcess，Factory SHALL 为其创建与其他 SubAgent 相同的 PiAgentRuntimeAdapter。Vision 不得使用专用 VisionPipelineRuntime。

#### Scenario: 创建 Vision SubAgent
- **WHEN** Main Agent foreground spawn vision Application
- **THEN** Supervisor 创建子 AgentProcess，并通过通用 Factory 为其装配独立 PiAgentRuntime

### Requirement: Vision Prompt 与任务输入

vision.md 正文 SHALL 成为 PiAgentRuntime systemPrompt。原始用户任务 SHALL 成为本次 prompt，图片 SHALL 作为通用 image attachments 与 prompt 一起传入。

#### Scenario: 任务相关图片分析
- **WHEN** 用户要求从截图中定位报错原因
- **THEN** Vision PiAgentRuntime 同时收到 vision.md systemPrompt、用户任务 prompt 和图片，并返回与任务相关的视觉证据

#### Scenario: 更新 Vision Prompt
- **WHEN** vision.md 正文更新并重新加载
- **THEN** 新 Vision Agent 使用新 systemPrompt，运行中的 Vision Agent 保持原 Application snapshot

### Requirement: Vision 模型由 Application 选择

Vision PiAgentRuntime SHALL 使用 Vision Application 的 model 字段选择模型。Bundled `model: vision` SHALL 解析为运行配置中的 Vision provider/model；项目 MAY 覆盖为 `provider/model`、bare model、inherit 或已配置 alias。密钥 SHALL 保持在运行配置或 provider 环境变量中。

#### Scenario: 项目覆盖 Vision 模型
- **WHEN** 项目级 vision.md 声明 `model: anthropic/claude-sonnet-4`
- **THEN** 新 Vision Agent 的 PiAgentRuntime 使用该 provider/model

### Requirement: Vision 使用空能力集

Bundled Vision Application SHALL 声明 `tools: []` 和 `skills: []`。缺省 mcpServers 与 hooks SHALL 编译为空配置，不得隐式继承父 Agent 的工具、MCP、Skills 或 Hooks。

#### Scenario: Vision Runtime 装配
- **WHEN** Factory 创建 Vision PiAgentRuntime
- **THEN** Runtime 只有模型与图片输入能力，不包含内置工具、MCP 工具、Skills 或 Hooks

### Requirement: 通用 Agent Attachment

Supervisor 内部 spawn API SHALL 使用 `AgentProcessInput.attachments` 传递带判别类型的 Attachment。进程 API MUST NOT 定义 Vision 专用 images 参数。

#### Scenario: Harness 启动 Vision Agent
- **WHEN** Harness 收到用户上传的 ImageContent
- **THEN** Harness 将其包装为 type=image 的 AgentAttachment，并通过通用 SpawnAgentRequest 启动 Vision

#### Scenario: 非图片 Attachment
- **WHEN** 其他 Application 接收 file 或 text attachment
- **THEN** 使用同一 SpawnAgentRequest 和 AgentProcessInput，不增加 Application 专用 spawn 字段

### Requirement: OCR 是 Application fallback

vision.md SHALL 声明受信任 OCR fallback 及触发条件。PiAgentRuntime 遇到 model_unavailable、model_error 或 empty_output 后，Supervisor 的执行策略 SHALL 在进程进入终态前解析并执行 OcrFallbackHandler。

#### Scenario: Vision 成功
- **WHEN** Vision PiAgentRuntime 返回非空结果
- **THEN** Agent 正常完成且不调用 OcrFallbackHandler

#### Scenario: OCR fallback 成功
- **WHEN** Vision PiAgentRuntime 返回可恢复失败且 OCR 提取到有效文本
- **THEN** 同一 AgentProcess 完成，agentId 不变且退出结果标记 executionSource=ocr

#### Scenario: 所有执行路径失败
- **WHEN** Vision PiAgentRuntime 和 OcrFallbackHandler 都失败
- **THEN** AgentProcess 才进入 failed 终态并保存两个阶段的诊断

### Requirement: Fallback Handler 受信任

AgentApplication 编译器 SHALL 只接受系统注册的 fallback handler 和事件类型。Agent.md MUST NOT 通过 fallback 配置选择任意模块、脚本或代码入口。

#### Scenario: 未注册 Handler
- **WHEN** Agent.md 声明 `fallback.handler: arbitrary-script`
- **THEN** Application 编译失败并产生结构化安全诊断

### Requirement: 用户图片入口创建 Vision Agent

当 Main Agent 不支持原生图片或配置要求独立 Vision Agent 时，Harness SHALL 通过 AgentSupervisor foreground 启动 vision Application。

#### Scenario: 用户上传图片
- **WHEN** 用户提交图片且 Main Agent 需要独立视觉分析
- **THEN** Process Table 出现 parentAgentId 指向 Main Agent 的 Vision Agent，结果完成后交给 Main Agent

### Requirement: 原生多模态直通

当 Main Agent 原生支持图片且没有要求独立 Vision Agent 时，系统 SHALL 保留图片直通路径并 MUST NOT 创建 Vision Agent。

#### Scenario: Main Agent 原生支持图片
- **WHEN** Main model input 包含 image 且未配置独立 Vision
- **THEN** 图片直接发送给 Main Agent，Process Table 不新增 Vision Agent

### Requirement: MCP 图片复用 Vision Application

当 MCP Tool 返回图片且当前模型需要独立视觉分析时，MCPManager SHALL 通过 AgentSupervisor 启动同一个 vision Application。

#### Scenario: MCP 图片分析
- **WHEN** MCP Tool 返回 ImageContent 且 Main Agent 不支持原生图片
- **THEN** 系统通过通用 SpawnAgentRequest 创建 Vision Agent，并将退出结果转换为 MCP Tool 文本结果

### Requirement: Vision 取消贯穿主执行与 fallback

terminate、kill 和前台用户 abort SHALL 通过 Agent 的 AbortSignal 传递到 PiAgentRuntime 与 OcrFallbackHandler。Abort 后 MUST NOT 启动新的 fallback 或继续 Main Agent prompt。

#### Scenario: 模型阶段取消
- **WHEN** Vision Agent 在模型调用阶段收到 kill
- **THEN** Vision 请求中止，OCR 不启动，Agent 进入 killed 并发布 agent:exit

#### Scenario: OCR 阶段取消
- **WHEN** Vision Agent 在 OCR fallback 阶段收到 kill
- **THEN** OCR worker 被终止，Main Agent 不接收不完整结果

### Requirement: Vision Session 路由

Vision PiAgentRuntime 与 OcrFallbackHandler MUST NOT 直接读写 `SessionManager.current`。父进程集成层 SHALL 按 parentSessionId 写入结果。

#### Scenario: 运行中切换 Session
- **WHEN** Session A 启动 Vision Agent 后 UI 切换到 Session B
- **THEN** Vision 结果仍写入 Session A，Session B 不接收该结果

### Requirement: 图片持久化边界

Attachment resolver SHALL 将 ImageContent 缓存为 ImageRef。AgentProcessStore SHALL 只持久化 ImageRef，不得持久化原始 base64。

#### Scenario: Process Store 保存图片输入
- **WHEN** Vision Agent 接收用户上传的 base64 图片
- **THEN** 保存后的进程记录只包含 ImageRef 和元数据

### Requirement: Vision SubAgent 确定性验收

CI SHALL 使用 fake PiAgentRuntime、fake Vision provider 和 fake OCR 覆盖 Vision 成功、OCR fallback、全部失败、abort、MCP 图片、Session 切换、空 capability 和原生多模态直通。

#### Scenario: CI 验收命令
- **WHEN** 执行 `npm run test:subagent`
- **THEN** Application 编译、PiAgentRuntime 创建、Supervisor、fallback、Store、事件和 Vision 集成测试全部运行并通过

### Requirement: 验收后无运行时泄漏

每个 Vision 验收用例结束后，Process Table MUST 不存在残留 running Vision Agent，OCR worker、Abort listener 和临时进程资源 SHALL 被清理。

#### Scenario: 完成验收套件
- **WHEN** Vision SubAgent 测试套件结束
- **THEN** 所有 Vision Agent 均处于终态且没有未处理 Promise 或活动监听器

