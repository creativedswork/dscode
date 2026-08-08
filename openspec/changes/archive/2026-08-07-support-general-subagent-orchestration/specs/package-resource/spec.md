## ADDED Requirements

### Requirement: general 作为 required bundled resource 发布

资源 catalog SHALL 将 `resources/agents/general.md` 声明为 required `agent:general` 条目。生产
构建 SHALL 校验其 Agent.md 格式、名称和非空正文，将其复制到 `dist/resources/agents/`，并在
manifest 中记录 mediaType 和 SHA-256。

#### Scenario: 发布包包含 general
- **WHEN** 执行生产构建
- **THEN** release staging 包含 `dist/resources/agents/general.md` 以及引用该文件的
  `agent:general` manifest entry

#### Scenario: general 资源缺失
- **WHEN** `resources/agents/general.md` 缺失、名称不匹配或正文为空
- **THEN** 构建失败且不生成可发布 staging

### Requirement: 安装后的 Registry 加载 general

PackageResourceProvider SHALL 将校验后的 `general.md` 与其他 bundled Agent.md 一并提供给
AgentApplicationRegistry，且 MUST 使用相同的 package URI、packageVersion 和 digest 规则。

#### Scenario: 随机 cwd 启动
- **WHEN** 用户从 npm tarball 安装 dscode 并在与仓库无关的 cwd 启动
- **THEN** Registry 从包内 manifest 加载 `general`，不访问源码目录或当前 cwd 中的资源副本
