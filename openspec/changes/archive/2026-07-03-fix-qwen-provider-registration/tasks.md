## 1. pi-ai 导入路径确认

- [x] 1.1 验证 `createProvider` 从 `@earendil-works/pi-ai` 或子路径可导入
- [x] 1.2 验证 `envApiKeyAuth` 可导入路径
- [x] 1.3 验证 `openAICompletionsApi`（或等价 lazy API）可导入路径
- [x] 1.4 若子路径不可导入，确定替代方案（内联构造 Provider 对象或直接访问 `models` 内部 API）

## 2. qwen 模型定义更新

- [x] 2.1 所有 `QWEN_MODELS` 条目添加 `compat.thinkingFormat: "qwen"`（保留已有 `supportsDeveloperRole: false`）
- [x] 2.2 `buildQwenModel` fallback 分支同步添加 `thinkingFormat: "qwen"`
- [x] 2.3 运行 `npm run typecheck` 确认类型兼容

## 3. pi-ai provider 注册

- [x] 3.1 在 `registry.ts` 中构造 qwen Provider（`createProvider({ id: "qwen", ... })`）
- [x] 3.2 调用 `models.setProvider(qwenProvider)` 注册到 pi-ai
- [x] 3.3 移除 `registry.ts` 底部的 `registerProvider("qwen", buildQwenModel, ...)` 调用
- [x] 3.4 确认 `getAllProviders()` 仍返回 "qwen"（通过 pi-ai 的 `getProviders()`）
- [x] 3.5 确认 `getAllModels("qwen")` 仍返回完整模型列表（通过 pi-ai 的 `getModels()`）
- [x] 3.6 运行 `npm run typecheck` 确认编译通过

## 4. 端到端验证

- [ ] 4.1 设置 `DASHSCOPE_API_KEY` 环境变量
- [ ] 4.2 启动 Web 模式，在 UI 中切换到 qwen provider
- [ ] 4.3 发送测试消息，确认正常回复（无 "provider not found" 错误）
- [ ] 4.4 对 reasoning 模型（如 qwen3.6-plus）开启 thinking，确认 `enable_thinking: true` 生效
