## Why

Qwen provider 的模型定义和 UI 展示（下拉框、模型列表）能正常工作，但提交消息时 API 调用失败，提示 provider 找不到。根因是 dscode 仅将 qwen 注册到了自己的 `providerFactories` Map 中（用于 `resolveModel` / `getAllModels`），但从未调用 `models.setProvider()` 将其注册到 pi-ai 的 `Models` 实例。`streamSimple()` 委托给 pi-ai 的 `models.streamSimple()`，pi-ai 无法识别 "qwen" 这个 provider，导致运行时错误。

## What Changes

- **在 pi-ai 的 `Models` 实例中注册 qwen provider**：用 `createProvider()` 构造完整的 Provider 对象，通过 `models.setProvider()` 注册，使 pi-ai 能够在流式调用时找到并驱动 qwen provider
- **扩大 `models` 实例的可见性**：当前 `models` 是 `registry.ts` 的模块私有变量，需要导出或提供注册入口，以便在 provider 定义处调用 `setProvider()`
- **`getAllModels("qwen")` 改为走 pi-ai 原生的 `models.getModels()`**：注册后 pi-ai 自己就能返回模型列表，不再依赖 dscode 自定义的 `customModelDefs` 回退逻辑
- **qwen 模型不再需要 dscode 自己的 `providerFactories` 回退**：`resolveModel("qwen", ...)` 可以直接通过 pi-ai 的 `models.getModel()` 查到，简化解析路径

## Capabilities

### New Capabilities

- `custom-provider-registration`: 建立将非 pi-ai builtin provider 正确注册到 pi-ai `Models` 实例的机制，确保模型解析和流式调用走同一套体系

### Modified Capabilities

- `model-registry`: 新增需求——自定义 provider 不仅要在 dscode 自己的 registry 中可解析，还必须注册到 pi-ai 的 `Models` 实例以支持实际 API 调用；`resolveModel` / `getAllModels` / `getAllProviders` 的行为应保持一致

## Impact

- `src/models/registry.ts` — 核心改动：导出 `models` 实例，注册 qwen provider 到 pi-ai
- `src/models/qwen.ts` — 可能需要调整模型定义以匹配 pi-ai 的 `Model<"openai-completions">` 类型
- `src/models/index.ts` — 可能新增导出
- pi-ai 0.80.3 已有 `thinkingFormat: "qwen"` 支持，基础能力就绪
