## ADDED Requirements

### Requirement: Shell 工具异步执行
`bash` 工具 SHALL 使用异步 `exec` 执行 shell 命令，不阻塞 Node.js 事件循环。超时控制通过 `AbortController` 实现，错误形状（stdout/stderr/exitCode）与同步版本一致。

#### Scenario: 命令正常执行
- **WHEN** bash 工具执行 `echo hello`
- **THEN** 返回 stdout 为 "hello"、exitCode 为 0，且执行期间事件循环保持空闲

#### Scenario: 命令执行超时
- **WHEN** bash 工具执行 `sleep 60` 且 timeout 设为 500ms
- **THEN** 500ms 后返回错误结果，包含 stderr 和 exitCode

#### Scenario: 命令执行失败
- **WHEN** bash 工具执行一个不存在的命令
- **THEN** 返回错误结果，包含 stderr 和非零 exitCode

### Requirement: 文件读取异步执行
`read_file` 工具 SHALL 使用 `fs/promises` 的 `readFile`、`stat`、`access` 进行文件操作，不阻塞事件循环。文件过大（>2MB）检查和文件不存在检查同样使用异步方法。

#### Scenario: 读取存在的文件
- **WHEN** read_file 工具读取一个存在的文件路径
- **THEN** 返回文件内容，且读取期间事件循环保持空闲

#### Scenario: 文件不存在
- **WHEN** read_file 工具读取不存在的路径
- **THEN** 返回 "file not found" 错误

#### Scenario: 文件过大
- **WHEN** read_file 工具读取超过 2MB 的文件
- **THEN** 返回 "file too large" 错误

### Requirement: 文件写入异步执行
`write_file` 和 `overwrite_file` 工具 SHALL 使用 `fs/promises` 的 `writeFile`、`mkdir`、`access` 进行文件操作，不阻塞事件循环。版本检查使用异步读取。

#### Scenario: 写入新文件
- **WHEN** write_file 工具写入一个不存在的路径
- **THEN** 创建文件并返回成功结果，且写入期间事件循环保持空闲

#### Scenario: 版本冲突拒绝
- **WHEN** write_file 工具覆盖已有文件但 expected_file_version 不匹配
- **THEN** 返回版本冲突错误，不执行写入

### Requirement: 目录列表异步执行
`list_files` 工具 SHALL 使用 `fs/promises` 的 `readdir` 进行递归目录遍历，使用异步递归函数替代同步递归。

#### Scenario: 列出目录内容
- **WHEN** list_files 工具列出项目根目录
- **THEN** 返回文件和子目录列表，且遍历期间事件循环保持空闲

#### Scenario: 目录不存在
- **WHEN** list_files 工具列出不存在的路径
- **THEN** 返回 "directory not found" 错误

### Requirement: 搜索工具异步执行
`grep` 和 `glob` 工具 SHALL 使用 `fs/promises` 的 `readdir`、`stat`、`readFile` 进行文件搜索和内容读取，使用异步递归函数 `walkDir`。

#### Scenario: grep 搜索匹配内容
- **WHEN** grep 工具搜索一个匹配的正则模式
- **THEN** 返回匹配行列表，且搜索期间事件循环保持空闲

#### Scenario: glob 匹配文件
- **WHEN** glob 工具使用 `src/**/*.ts` 模式
- **THEN** 返回匹配的 .ts 文件列表

### Requirement: Edit 工具异步执行
`edit` 工具 SHALL 使用 `fs/promises` 的 `readFile`、`writeFile` 进行文件读写，dry-run 和实际修改均使用异步 I/O。

#### Scenario: 正常编辑文件
- **WHEN** edit 工具对文件执行 replace_line 操作
- **THEN** 文件被修改并返回成功结果，且 I/O 期间事件循环保持空闲

#### Scenario: 文件不存在
- **WHEN** edit 工具编辑不存在的文件
- **THEN** 返回 "file not found" 错误
