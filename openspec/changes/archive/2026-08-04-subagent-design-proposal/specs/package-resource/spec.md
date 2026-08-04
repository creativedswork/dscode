## ADDED Requirements

### Requirement: 顶层发行资源目录

系统 SHALL 使用仓库顶层 `resources/` 保存产品发行资源。Bundled Agent.md SHALL 位于 `resources/agents/`，MUST NOT 位于 `src/`。

#### Scenario: Vision 作者资源
- **WHEN** 开发者修改 Bundled Vision Application
- **THEN** 修改目标为 `resources/agents/vision.md`

### Requirement: 资源 Catalog 与 Manifest

`resources/catalog.json` SHALL 声明资源逻辑 ID、类型、作者路径和 required 状态。生产构建 SHALL 生成 `dist/resources/manifest.json`，每个 entry MUST 包含相对路径、mediaType 和 SHA-256，manifest MUST 包含 schemaVersion 和 packageVersion。

#### Scenario: 生成 Agent 资源条目
- **WHEN** 构建包含 `resources/agents/vision.md`
- **THEN** manifest 包含逻辑 ID `agent:vision`、发布相对路径和内容 digest

#### Scenario: Required 资源缺失
- **WHEN** catalog 声明 required 资源但作者文件不存在
- **THEN** 构建失败且不生成可发布 staging

### Requirement: PackageResourceProvider

生产运行时 SHALL 使用 PackageResourceProvider 从 CLI 入口 `import.meta.url` 相对解析 `./resources/manifest.json`。Provider SHALL 校验 schemaVersion、packageVersion、required entry 和 SHA-256 后再向 AgentApplicationRegistry 提供 Bundled 文档。

生产运行时 MUST NOT 搜索 cwd、`src/` 或多个候选资源目录。开发和测试 MAY 通过显式构造参数注入 resource root。

#### Scenario: npm 全局安装后启动
- **WHEN** dscode 从任意 cwd 通过 npm 全局安装入口启动
- **THEN** Provider 从已安装包的 `dist/resources/` 加载 vision.md，不访问当前工作目录

#### Scenario: 资源被修改
- **WHEN** 包内 vision.md 内容与 manifest SHA-256 不一致
- **THEN** 启动失败并报告资源完整性错误

### Requirement: Bundled 资源逻辑来源

Bundled AgentApplication source SHALL 使用稳定的 package URI，并 SHALL 在 Process Store 中保存 packageVersion 和 digest。系统 MUST NOT 将 npm 安装绝对路径作为可复现身份。

#### Scenario: 保存 Vision Process
- **WHEN** npm 包版本 0.2.7 启动 Vision Agent
- **THEN** snapshot source 类似 `pkg:@creative-dswork/dscode@0.2.7/agents/vision.md`

### Requirement: 唯一 npm Release Staging

系统 SHALL 使用 `release/package/` 作为唯一 npm 发布 staging。该目录 SHALL 包含最小 package.json、README、LICENSE、CLI bundle 和 `dist/resources/`。

仓库根 package.json SHOULD 设置 `private: true`，release package.json SHALL 由构建生成且不得包含 private=true。发布流程 MUST NOT 从仓库根目录执行 npm publish。

#### Scenario: 构建发布目录
- **WHEN** 执行生产 package build
- **THEN** `release/package/` 可独立执行 npm pack，且不依赖仓库中的 src、tests 或 docs

### Requirement: npm Tarball 内容验证

CI SHALL 对 `npm pack ./release/package` 生成的 tgz 执行 allowlist、版本、manifest、digest 和体积验证。Tarball MUST NOT 包含 `src/`、tests、截图、`.env`、工作区配置或 release staging 之外的文件。

#### Scenario: Tarball 混入源码
- **WHEN** npm pack 结果包含 `src/` 或测试文件
- **THEN** package verification 失败且禁止发布

#### Scenario: 版本不一致
- **WHEN** Git tag、release package.json 或 resource manifest 的版本不一致
- **THEN** package verification 失败且禁止发布

### Requirement: Tarball 安装 Smoke Test

CI SHALL 将生成的 tgz 安装到临时目录，并 SHALL 从与仓库无关的随机 cwd 执行 CLI 版本检查和 Bundled resource 加载检查。

#### Scenario: 安装后加载 Vision
- **WHEN** 临时项目安装 tgz 并从随机 cwd 启动 dscode 资源检查
- **THEN** AgentApplicationRegistry 成功加载 package 内的 vision Application

### Requirement: GitHub Actions 发布同一产物

GitHub Actions build job SHALL 生成一次 tgz，完成验证和安装 Smoke Test 后将该 tgz 作为 artifact 上传。publish job SHALL 下载并发布同一个 tgz，MUST NOT 下载目录后重新执行 npm pack。

#### Scenario: Tag 触发发布
- **WHEN** 合法版本 Tag 触发 publish workflow
- **THEN** npm registry 收到的 tarball 与 build job 验证的 artifact 字节一致

### Requirement: npm Trusted Publishing

GitHub Actions publish job SHOULD 使用 npm Trusted Publishing/OIDC，并 SHALL 在发布时启用 provenance。长期 token MAY 仅作为未启用 Trusted Publishing 时的受控回退。

#### Scenario: OIDC 发布
- **WHEN** npm package 已配置 Trusted Publisher
- **THEN** workflow 使用 id-token 权限执行 `npm publish <tgz> --access public --provenance`

### Requirement: Package 版本回滚

Bundled resources SHALL 与 CLI 使用同一 npm package 版本。回滚 SHALL 通过安装或发布既有 package 版本完成，系统 MUST NOT 在用户目录维护可漂移的 Bundled resource 副本。

#### Scenario: 回滚 dscode
- **WHEN** 用户从新版本回滚到旧 npm 版本
- **THEN** CLI、manifest 和 Bundled Agent.md 同时回滚到该版本
