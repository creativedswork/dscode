## Why

在开发 dscode 本身或调试 Agent 行为时，开发者需要知道**运行时实际发送给模型的完整 System Prompt**（包括动态合并的 deferred tools hint、skills、memories 等）。目前没有任何机制可以在终端打印该系统提示词，开发者只能通过阅读源码手动拼接，效率低下且容易出错。

同时，这个调试开关**仅面向 dscode 开发者**，对于 npm 包用户是多余且危险的信息泄露面（暴露内部 prompt 结构），因此必须在 npm 发布产物中完全不可见。

## What Changes

- **新增 `--debug` CLI 开关**：仅当从源码运行时（`npm start` / `tsx`）生效，npm 包用户执行 `dscode --debug` 时不会识别该参数
- **新增 `isDevMode()` 检测函数**：通过 `import.meta.url` 判断当前是从源码 (`main.ts`) 运行还是从构建产物 (`dscode.mjs`) 运行
- **在 `Harness.initialize()` 和 prompt 重建时将 System Prompt 写入文件**：当 `--debug` 启用时，将完整的 `this.agent.state.systemPrompt` 写入 `dscode/dump/system-prompt.md`
- **不修改 HarnessConfig 或对外 API**：debug 标志仅通过 CLI 参数传递，不进入配置体系

## Capabilities

### New Capabilities
- `debug-system-prompt`: 开发者可通过 `--debug` 标志在 `dscode/dump/system-prompt.md` 中查看运行时完整 System Prompt

### Modified Capabilities
- `core-harness`: `initialize()` 和 prompt 重建路径在 debug 模式下将 system prompt 写入 `dscode/dump/system-prompt.md`

## Impact

- `src/core/main.ts` — `parseArgs()` 新增 `debug: boolean` 字段，`main()` 将 debug 标志传入 Harness 构造函数；新增 `isDevMode()` 检测
- `src/core/harness.ts` — 构造函数接收可选的 `debug` 参数，在 `initialize()` 和 system prompt 重建时将内容写入 `dscode/dump/system-prompt.md`
- `.gitignore` — 新增 `dump/` 条目，确保调试输出不被提交
