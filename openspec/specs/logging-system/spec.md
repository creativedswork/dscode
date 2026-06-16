## Purpose

File-based logging system with channel-based routing and agent context injection.

## Requirements

### Requirement: Logger Constructor

`Logger` 构造函数 SHALL 接受 `{ type: string, id: string }` 参数，表示 Agent 类型和运行时 ID。

每次调用 `debug/info/warn/error` 时，该 agent 身份信息 SHALL 自动附加到日志行中。

#### Scenario: Logger created with agent context

- **WHEN** 调用 `new Logger({ type: "harness", id: "rt_a1b2" })`
- **THEN** 后续每条日志行 SHALL 包含 `[harness/rt_a1b2]`

### Requirement: Log Channels

Logger SHALL 支持四个 channel：`lifecycle`、`session`、`tool`、`analysis`。

channel 作为 `debug/info/warn/error` 方法的第一个参数传递。

#### Scenario: Write to specific channel

- **WHEN** 调用 `logger.info("analysis", "Phase0", "Library: 42 files")`
- **THEN** 日志 SHALL 被写入 `~/.dscode/logs/analysis.log`
- **AND** 调用 `logger.error("session", "Save", "failed")`
- **THEN** 日志 SHALL 被写入 `~/.dscode/logs/session.log`

### Requirement: Log Levels

Logger SHALL 支持四个 level：`debug`、`info`、`warn`、`error`，优先级依次升高。

Logger SHALL 接受可选的 `level` 参数（构造时或运行时设置），低于该 level 的日志 SHALL 被丢弃。默认 level 为 `debug`（记录所有）。

#### Scenario: Level filtering

- **WHEN** Logger level 设置为 `info`
- **THEN** `logger.debug(...)` SHALL 不产生任何输出
- **AND** `logger.info/warn/error(...)` SHALL 正常输出

### Requirement: File-Only Output

Logger SHALL 将所有日志写入 `~/.dscode/logs/<channel>.log` 文件。

Logger SHALL NOT 向终端（stdout/stderr）输出任何内容。

若 `~/.dscode/logs/` 目录不存在，SHALL 自动创建（`mkdirSync({ recursive: true })`）。

若文件写入失败，SHALL 静默丢弃日志，不抛出异常。

#### Scenario: Directory auto-creation

- **WHEN** `~/.dscode/logs/` 不存在
- **AND** 调用 `logger.info("lifecycle", "Start", "process started")`
- **THEN** 系统 SHALL 创建 `~/.dscode/logs/` 目录
- **AND** 写入 `~/.dscode/logs/lifecycle.log`

#### Scenario: Write failure is silent

- **WHEN** 文件写入因任何原因失败（权限、磁盘满等）
- **THEN** Logger SHALL 不抛出异常
- **AND** 调用方 SHALL NOT 感知到失败

### Requirement: Log Line Format

每条日志 SHALL 为一行，格式：

```
[YYYY-MM-DD HH:MM:SS] [LEVEL] [channel] [agent_type/agent_id] [tag] message
```

- `timestamp`：UTC+8 本地时间，精确到秒
- `LEVEL`：大写（`DEBUG`、`INFO`、`WARN`、`ERROR`）
- `channel`：小写 channel 名称
- `agent_type/agent_id`：Logger 构造时注入
- `tag`：语义标签，由调用方传入
- `message`：自由文本

#### Scenario: Formatted log line

- **WHEN** 调用 `logger.info("analysis", "Phase0", "Library: 42 files")`
- **AND** Logger 的 agent context 为 `{ type: "harness", id: "rt_a1b2" }`
- **THEN** 写入的行格式 SHALL 匹配 `[2026-06-16 ...] [INFO] [analysis] [harness/rt_a1b2] [Phase0] Library: 42 files`

### Requirement: Channel Clear

Logger SHALL 提供 `clear(channel)` 方法，清空指定 channel 的日志文件。

#### Scenario: Clear analysis log

- **WHEN** eval 命令开始时调用 `logger.clear("analysis")`
- **THEN** `~/.dscode/logs/analysis.log` 文件内容 SHALL 被清空
- **AND** 后续日志 SHALL 从文件开头开始写入
