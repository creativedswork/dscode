## ADDED Requirements

### Requirement: spawn_agent 展示可选 Application

`spawn_agent` 的模型可见工具描述 SHALL 包含当前 AgentApplicationRegistry 中全部有效
Application 的 name 和 description，并 SHALL 按 name 稳定排序。该 catalog SHALL 在工具描述
被读取时从 Registry 获取，MUST NOT 固化为 Harness 初始化时的旧快照。

#### Scenario: Main 选择专业 Agent
- **WHEN** Registry 包含 `general`、`vision` 和项目级 `reviewer`
- **THEN** Main Agent 在调用 `spawn_agent` 前能从工具描述看到三个名称及其用途

#### Scenario: Registry reload 后选择新 Agent
- **WHEN** 项目切换使 Registry 从 `reviewer` 变为 `researcher`
- **THEN** 后续模型请求中的 `spawn_agent` 描述包含 `researcher` 且不再包含旧项目的 `reviewer`

### Requirement: spawn_agent 解析项目内图片 attachment

模型可调用的 `spawn_agent` SHALL 接受 `file` attachment 引用父 Agent cwd 内已经存在的本地
图片。工具 MUST 在创建 Process 前解析真实路径、校验 cwd 边界与文件类型、限制单图最大
20MB，并 SHALL 通过 ImageCache 将其转换为标准 image attachment。调用方提供的
`image_ref` MUST 是已经存在的单一缓存文件名，MUST NOT 接受本地路径或 `file://` URI。

#### Scenario: 传递刚生成的 PNG
- **WHEN** Main Agent 使用 file attachment 传入 cwd 内存在的 PNG 路径
- **THEN** `spawn_agent` 将图片缓存为 ImageRef，并让子 Process 收到 type=image attachment

#### Scenario: file URI 指向 cwd 外部
- **WHEN** file attachment 的真实路径位于父 Agent cwd 外部或通过软链接逃逸
- **THEN** `spawn_agent` 在创建 Process 前拒绝调用并返回路径越界诊断

#### Scenario: 路径伪装成 image_ref
- **WHEN** 调用方把本地路径或 `file://` URI 填入 `image_ref.hash`
- **THEN** `spawn_agent` 拒绝调用并提示本地图片应使用 file attachment

#### Scenario: 缓存引用不存在
- **WHEN** 调用方提供格式合法但 ImageCache 中不存在的 image_ref
- **THEN** `spawn_agent` 拒绝调用且不启动无法获得图片的子 Process

## MODIFIED Requirements

### Requirement: Application 必须显式指定

`spawn_agent` SHALL 要求显式 application。系统 SHALL 提供名为 `general` 的 bundled
Application，但 MUST NOT 在省略 application 时隐式选择 `general`，也不得因省略 application
隐式触发 Fork。

#### Scenario: 显式使用 general
- **WHEN** Main Agent 没有找到职责匹配的专业 Agent.md 并指定 application 为 `general`
- **THEN** 系统通过标准 Application 创建链启动通用 SubAgent

#### Scenario: 缺少 Application
- **WHEN** Main Agent 只提供 description 和 input
- **THEN** 参数校验失败且不创建进程
