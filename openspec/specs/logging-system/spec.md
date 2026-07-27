## Purpose

File-based logging system with agent context injection, writing to a single unified log file.


## Requirements
### Requirement: Logger Constructor

`Logger` 构造函数 SHALL 接受 `{ type: string, id: string }` 参数，表示 Agent 类型和运行时 ID。

每次调用 `debug/info/warn/error` 时，该 agent 身份信息 SHALL 自动附加到日志行中。

#### Scenario: Logger created with agent context

- **WHEN** 调用 `new Logger({ type: "harness", id: "rt_a1b2" })`
- **THEN** 后续每条日志行 SHALL 包含 `[harness/rt_a1b2]`

### Requirement: Log Channels

Logger SHALL 将所有日志写入单一文件 `~/.dscode/logs/dscode.log`。

LogChannel 概念已移除——tag（如 `EventBus`、`SIGINT`、`FocusPipeline`）提供足够粒度，`grep` 用于按 tag 过滤。

API 从 `logger.info(channel, tag, msg)` 简化为 `logger.info(tag, msg)`。

#### Scenario: All logs go to one file

- **WHEN** 调用 `logger.info("Phase0", "Library: 42 files")`
- **AND** 调用 `logger.error("Save", "trySaveSession failed")`
- **THEN** 两条日志 SHALL 均写入 `~/.dscode/logs/dscode.log`
- **AND** 两条日志 SHALL 按时间顺序排列

### Requirement: Log Levels

Logger SHALL 支持四个 level：`debug`、`info`、`warn`、`error`，优先级依次升高。

Logger SHALL 接受可选的 `level` 参数（构造时或运行时设置），低于该 level 的日志 SHALL 被丢弃。默认 level 为 `debug`（记录所有）。

#### Scenario: Level filtering

- **WHEN** Logger level 设置为 `info`
- **THEN** `logger.debug(...)` SHALL 不产生任何输出
- **AND** `logger.info/warn/error(...)` SHALL 正常输出

### Requirement: File-Only Output

Logger SHALL 将所有日志写入 `~/.dscode/logs/dscode.log` 文件。

Logger SHALL NOT 向终端（stdout/stderr）输出任何内容。

若 `~/.dscode/logs/` 目录不存在，SHALL 自动创建（`mkdirSync({ recursive: true })`）。

若文件写入失败，SHALL 静默丢弃日志，不抛出异常。

#### Scenario: Directory auto-creation

- **WHEN** `~/.dscode/logs/` 不存在
- **AND** 调用 `logger.info("Start", "process started")`
- **THEN** 系统 SHALL 创建 `~/.dscode/logs/` 目录
- **AND** 写入 `~/.dscode/logs/dscode.log`

#### Scenario: Write failure is silent

- **WHEN** 文件写入因任何原因失败（权限、磁盘满等）
- **THEN** Logger SHALL 不抛出异常
- **AND** 调用方 SHALL NOT 感知到失败

### Requirement: Log Line Format

每条日志 SHALL 为一行，格式：

```
[YYYY-MM-DD HH:MM:SS] [LEVEL] [agent_type/agent_id] [tag] message
```

- `timestamp`：UTC+8 本地时间，精确到秒
- `LEVEL`：大写（`DEBUG`、`INFO`、`WARN`、`ERROR`）
- `agent_type/agent_id`：Logger 构造时注入
- `tag`：语义标签，由调用方传入
- `message`：自由文本

注意：与原格式相比，移除了 `[channel]` 字段——channel 信息已由 tag 充分覆盖。

#### Scenario: Formatted log line

- **WHEN** 调用 `logger.info("Phase0", "Library: 42 files")`
- **AND** Logger 的 agent context 为 `{ type: "harness", id: "rt_a1b2" }`
- **THEN** 写入的行格式 SHALL 匹配 `[2026-07-16 ...] [INFO] [harness/rt_a1b2] [Phase0] Library: 42 files`

### Requirement: Channel Clear

Logger SHALL 提供 `clear()` 方法（无参数），清空整个日志文件。

#### Scenario: Clear log file

- **WHEN** 调用 `logger.clear()`
- **THEN** `~/.dscode/logs/dscode.log` 文件内容 SHALL 被清空
- **AND** 后续日志 SHALL 从文件开头开始写入

### Requirement: Tag Naming Convention

`tag` SHALL 为 PascalCase 常量字符串（如 `EventBus`、`SessionManager`、`Phase0`）。

tag SHALL NOT 为动态变量或包含空格、连字符、下划线。

同一文件内的所有日志调用 SHALL 使用一致的命名风格。

#### Scenario: Valid tags

- **WHEN** 调用 `logger.info("EventBus", "handler error")`
- **OR** 调用 `logger.error("McpReload", "config reload failed")`
- **THEN** 这些 SHALL 被视为有效 tag

#### Scenario: Invalid tags

- **WHEN** tag 为 `"web-backend"`（kebab-case）
- **OR** tag 为 `stepName`（动态变量）
- **OR** tag 为 `"save session"`（含空格）
- **THEN** 这些 SHALL NOT 使用；应改为 `"WebBackend"`、固定常量、`"SaveSession"` 等 PascalCase 形式

