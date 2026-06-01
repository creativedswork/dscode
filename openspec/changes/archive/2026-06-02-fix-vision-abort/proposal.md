## Why

视觉模型再处理（vision model reprocessing）期间按 Esc/停止按钮无法 abort —— vision 调用阻塞在 `agent.prompt()` 之前，`agent.abort()` 是空操作。用户被迫等待最长 60 秒超时，体验极差。

## What Changes

- **`ProcessOptions` 增加 `signal?: AbortSignal`** — 允许调用方传入 abort 信号
- **`describeImagesViaVisionModel` 接受并传递 `AbortSignal`** — 将信号传入 `streamSimple`，使 vision API 调用可中断
- **`ImagePipeline.process()` 创建自有 `AbortController`** — 在方法内部创建 controller，同时接受外部传入的 signal，两者任一 abort 都触发中断
- **OCR 阶段支持 abort** — `ocrImages()` 接受 signal，监听 abort 事件调用 `worker.terminate()`
- **`Harness.promptWithImages()` 创建 shared `AbortController`** — 在调用 pipeline 前创建 controller，确保 vision 预处理和后续 `agent.prompt()` 都在同一个 abort 信号覆盖下
- **`Harness` 暴露 `abort()` 方法** — 使得 UI 层调用 `harness.abort()` 即可同时 abort vision 预处理和 agent 循环

## Capabilities

### New Capabilities

- `vision-abort`: 视觉模型再处理可被用户中断 —— AbortSignal 贯穿 imagePipeline.process → vision client → streamSimple 全链路，OCR 阶段通过 worker.terminate() 支持中断

### Modified Capabilities

- `vision-pipeline`: `ProcessOptions` 增加 `signal` 字段；pipeline 在所有异步阶段检查/传递 abort 信号
- `image-pipeline`: `ImagePipeline.process()` 内部创建 AbortController，接受外部 signal 进行 race；OCR 支持 abort
- `core-harness`: `promptWithImages()` 创建 AbortController 覆盖 vision 预处理；暴露 `harness.abort()` 方法

## Impact

- **修改文件**: `drivers/vision/types.ts`, `drivers/vision/client.ts`, `drivers/vision/pipeline.ts`, `drivers/vision/ocr.ts`, `core/harness.ts`, `core/harness-api.ts`
- **UI 调用方** (TUI `tui-app.ts`, Web `web-backend.ts`): 将 `harness.agent.abort()` 改为 `harness.abort()`（或同时调用两者以保证兼容）
- **不涉及破坏性变更**: `ProcessOptions` 新增可选字段，已有调用方无需修改
- **外部依赖**: `streamSimple` 的 `SimpleStreamOptions` 已支持 `signal?: AbortSignal`（pi-ai types.d.ts L27），无需升级
