## Context

dscode 当前的模型体系有两层：

```
┌──────────────────────────────────────────────────────┐
│ Layer 1: dscode 自定义 registry                      │
│  providerFactories / customModelDefs                 │
│  → resolveModel(), getAllModels(), getAllProviders() │
│  → 解决：UI 能展示 provider 和 model 列表              │
├──────────────────────────────────────────────────────┤
│ Layer 2: pi-ai Models 实例                           │
│  builtinModels() → builtin providers                 │
│  → streamSimple(), complete(), completeSimple()      │
│  → 解决：实际 API 调用                                │
└──────────────────────────────────────────────────────┘
```

qwen 只在 Layer 1 注册了，Layer 2 没有。当 `streamSimple(model, context)` 调用时，pi-ai 根据 `model.provider === "qwen"` 查找 provider 驱动，找不到就报错。

pi-ai 0.80.3 提供了完整的自定义 provider 机制：`createProvider()` + `MutableModels.setProvider()`。已内置 `thinkingFormat: "qwen"` 支持。deepseek provider 就是通过这套机制注册的。

## Goals / Non-Goals

**Goals:**
- qwen 模型能正常对话（流式调用成功，reasoning 参数正确）
- `resolveModel("qwen", ...)` 和 `streamSimple()` 走同一套 provider 体系
- 为未来自定义 provider（如 minimax-cn 等）建立可复用的注册模式

**Non-Goals:**
- 不迁移现有 pi-ai builtin provider 的注册方式
- 不改变 Web UI 的 provider 切换逻辑（那是另一个 bug）
- 不过度抽象——先解决 qwen，模式清晰后再泛化

## Decisions

### Decision 1: 用 `createProvider()` + `models.setProvider()` 替代 dscode 的 `registerProvider("qwen")`

**方案**：在 `registry.ts` 初始化时，用 pi-ai 的 `createProvider()` 构造 qwen Provider，通过 `models.setProvider()` 注册。

```
createProvider({
  id: "qwen",
  name: "Qwen (DashScope)",
  baseUrl: DASHSCOPE_BASE,
  auth: { apiKey: envApiKeyAuth("DashScope API key", ["DASHSCOPE_API_KEY"]) },
  models: Object.values(QWEN_MODELS),
  api: openAICompletionsApi(),
})
```

注册后，`models.getModel("qwen", "qwen3.6-plus")` 直接可用，`resolveModel` 的第一分支（builtin check）就能命中，不再需要 fallback 到 `providerFactories`。

**替代方案考虑**：保留 dscode 自己的 `registerProvider` 并让它内部调用 `models.setProvider()`——但这引入了不必要的间接层。既然 pi-ai 已经提供了完整的 Provider 抽象，直接用更好。

### Decision 2: 不再维护 `providerFactories` 和 `customModelDefs` 中的 qwen 条目

`registerProvider("qwen", ...)` 这行将替换为 `models.setProvider(qwenProvider)`。

- `getAllProviders()` 通过 `models.getProviders()` 自动包含 qwen（无需手动合并）
- `getAllModels("qwen")` 通过 `models.getModels("qwen")` 直接返回，无需 `customModelDefs` 回退
- `resolveModel("qwen", ...)` 通过 `models.getModel("qwen", ...)` 命中

`providerFactories` 和 `customModelDefs` 暂时保留（结构不删），以备未来有无法用 pi-ai Provider 表达的边缘场景。但 qwen 不再使用它们。

### Decision 3: 模型定义加上 `thinkingFormat: "qwen"`

pi-ai 0.80.3 的 `OpenAICompletionsCompat` 新增了 `thinkingFormat` 字段。qwen 的 reasoning 需要 `enable_thinking: boolean` 格式，设置为 `"qwen"`。

```diff
  compat: {
    supportsDeveloperRole: false,
+   thinkingFormat: "qwen",
  },
```

这将替换 `buildQwenModel` 中 fallback 模型的默认值，以及所有 `QWEN_MODELS` 条目。

### Decision 4: 将 models 实例导出为 `getModelsInstance()`

当前 `models` 是模块私有的 `const`。为了在 `registry.ts` 底部调用 `models.setProvider()`，不需要额外导出——它就在同一模块内可访问。但如果未来其他模块需要动态注册 provider（如 MCP 加载的第三方 provider），可通过导出函数访问：

```typescript
export function getModelsInstance(): MutableModels {
  return models;
}
```

**但本次 change 不引入此导出。** 只在 `registry.ts` 内部使用，保持最小变更。

## Risks / Trade-offs

- **[Risk] QWEN_MODELS 类型不兼容 pi-ai 的 `Model<"openai-completions">`** → 当前定义使用 `Omit<Model<Api>, "id" | "name">`，`createProvider` 接受 `readonly Model<TApi>[]`。需要验证 TypeScript 编译通过，必要时加 `as const` 或类型断言。
- **[Risk] `envApiKeyAuth` / `openAICompletionsApi` 是 pi-ai 内部模块** → 路径是 `@earendil-works/pi-ai` 的 subpath export，需确认 pi-ai 的 `exports` 字段是否暴露这些路径。如果不暴露，需要改用 pi-ai 的公开 API 或直接构造 Provider 对象。
