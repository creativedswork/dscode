## 1. Types — ProcessOptions 增加 signal 字段

- [x] 1.1 `drivers/vision/types.ts`: `ProcessOptions` 增加 `signal?: AbortSignal` 字段

## 2. Vision Client — describeImagesViaVisionModel 支持 AbortSignal

- [x] 2.1 `drivers/vision/client.ts`: `describeImagesViaVisionModel` 增加 `signal?: AbortSignal` 参数
- [x] 2.2 将 `signal` 传入 `streamSimple` 的 `SimpleStreamOptions`
- [x] 2.3 在函数内捕获 `AbortError`，重新 throw

## 3. OCR — ocrImages / ocrImage 支持 AbortSignal

- [x] 3.1 `drivers/vision/ocr.ts`: `ocrImages` 和 `ocrImage` 增加 `signal?: AbortSignal` 参数
- [x] 3.2 注册 `signal.addEventListener("abort", handler)` + `worker.terminate()`
- [x] 3.3 在 `recognize` 完成后移除 abort 事件监听器
- [x] 3.4 signal 已 abort 时立即 throw `AbortError`

## 4. Pipeline — ImagePipeline.process 传递 signal

- [x] 4.1 `drivers/vision/pipeline.ts`: `process()` 从 `options.signal` 解构 `signal`
- [x] 4.2 在调用 `describeImagesViaVisionModel` 时传入 `signal`
- [x] 4.3 在调用 `ocrImages` 时传入 `signal`
- [x] 4.4 捕获 `AbortError`：不 fallback，不调用 `onWarning`，直接 throw
- [x] 4.5 在每个异步阶段之间检查 `signal?.aborted`

## 5. Harness — promptWithImages 创建 AbortController + abort 方法

- [x] 5.1 `core/harness.ts`: 添加 `private visionAbortController: AbortController | null = null`
- [x] 5.2 `promptWithImages()`: 创建新 `AbortController` 赋值给 `this.visionAbortController`
- [x] 5.3 将 `signal` 通过 `ProcessOptions` 传入 `process()`
- [x] 5.4 捕获 `AbortError`：`ui.setProcessing(false)` + 不调用 `agent.prompt()`
- [x] 5.5 非 `AbortError` 按原有逻辑，finally 清除 `visionAbortController`
- [x] 5.6 添加公共方法 `abort(): void`

## 6. HarnessAPI — 声明 abort 方法

- [x] 6.1 `core/harness-api.ts`: 在 `HarnessAPI` 接口中添加 `abort(): void` 声明

## 7. UI 调用方 — 切换到 harness.abort()

- [x] 7.1 `ui/tui-app.ts`: 将三处 `this.deps.agent.abort()` → `this.deps.abort()`
- [x] 7.2 `ui/web/web-backend.ts`: 将 `this.harness.agent.abort()` → `this.harness.abort()`

## 8. 验证

- [x] 8.1 运行 `npm run typecheck` 确认无类型错误
- [x] 8.2 运行 `npm test` 确认现有测试通过（4 个预存在的非相关失败）
- [ ] 8.3 手动测试：发送图片 → 在 vision 处理期间按停止 → 确认立即中断（不等待超时）
- [ ] 8.4 手动测试：不发送图片 → 正常对话 → 按停止 → 确认 agent 正常 abort（无回归）
