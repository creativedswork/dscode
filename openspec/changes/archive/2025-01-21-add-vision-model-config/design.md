## Context

当前系统 `HarnessConfig` 中只有单一的 `provider` / `modelId` / `apiKey` 三元组。图片输入流程在两处实现：

**TUI 流程** (`tui-app.ts` `handleSubmit`):
1. 通过 `deps.modelSupportsImages` 判断主模型是否支持 image
2. 通过 `deps.modelNeedsOcr` 判断是否需要 OCR（仅 deepseek/kimi-coding）
3. 若 needsOcr → 调用 `ocrImages()` 提取文字后纯文本发送
4. 否则 → 直接 `agent.prompt(text, images)` 传图

**Web 流程** (`web-backend.ts` `handleMessage` chat case):
1. 通过 `model.input.includes("image")` 判断是否支持
2. 同样逻辑：OCR 或原生传图

两个流程的核心问题是：**当主模型不支持图片时，只有 OCR 一条路**。若用户配置了视觉模型，应该在此时自动路由到视觉模型处理图片请求。

## Goals / Non-Goals

**Goals:**
- 用户可独立配置视觉模型（provider + modelId），与主模型解耦
- 当请求包含图片且有视觉模型配置时，自动使用视觉模型
- 无图片请求不受影响，始终使用主模型
- 视觉模型不可用时优雅降级：视觉模型配置了但解析失败 → OCR fallback
- CLI 命令 `/config vision-provider` / `/config vision-model` 与现有 `/config` 风格一致

**Non-Goals:**
- 不改变 OCR 实现本身
- 不改变 `Agent` 的模型状态管理（视觉模型是一次性使用的，不修改 `agent.state.model`）
- 不改变配置文件的格式（仍然是 JSON）

## Decisions

### Decision 1: 视觉模型作为 HarnessConfig 的可选字段

在 `HarnessConfig` 和 `config.json` 中新增一个可选的嵌套对象：
```typescript
vision?: {
  provider: string;   // 视觉模型 provider
  model: string;      // 视觉模型 model ID
  key?: string;       // 视觉模型 API key（可选，优先级高于环境变量）
视觉模型的 API key 优先级：1) `vision.key` 配置项（通过 `/config vision-key` 设置）→ 2) provider 对应的环境变量（`getEnvApiKey`）→ 3) 主模型的 `config.apiKey`。
**理由**: 配置简单、与现有 config 风格一致。支持独立 API key 满足视觉模型和主模型使用不同服务商/不同 key 的场景。
### Decision 2: 图片路由逻辑收敛到 Harness 层

在 `Harness` 中新增方法 `resolveEffectiveModel(hasImages: boolean): { provider, modelId, apiKey }`，返回当前请求实际应使用的模型信息。TUI 和 Web 不再各自判断，统一调用此方法。

但实际 prompt 调用需要灵活性：视觉模型需要构造一个**独立的 prompt 调用**（不同的 model/apiKey），而非替换 agent 的全局 model 状态。

**最终设计**: 在 `Harness` 中新增 `promptWithImages(text, images)` 方法，内部完成：
1. 判断是否有视觉模型配置
2. 如果有 → 用视觉模型发起独立请求，将视觉模型的响应作为 context 注入到主模型的 prompt 中
3. 如果无但主模型支持 image → 直接 `agent.prompt(text, images)`
4. 否则 → OCR fallback

**2024-12 补充 —— 更简单的方案**: 视觉模型仅负责"看图说话"，将图片内容转成文本描述，然后拼接回原 prompt 交给主模型继续。相当于用视觉模型替代 OCR 的角色，差异在于视觉模型理解语义而 OCR 只提取文字。

**实现流程**:
```
用户: "这个截图里有什么bug？" + [image.png]
  ↓
Harness.promptWithImages 检测到 hasImages && visionProvider 已配置
  ↓
用 visionModel 调用 pi-ai 的 streamSimple/prompt: "描述这张图片的内容"
  ↓
拿到视觉模型返回的文本描述 textFromVision
  ↓
构造增强 prompt: "这个截图里有什么bug？\n\n<image_description>\ntextFromVision\n</image_description>"
  ↓
用主模型 agent.prompt(enhancedText) 正常处理
```

**优点**: 
- 视觉模型不参与 agent loop，只做一次性图片→文本转换
- 无需修改 Agent 状态机
- 视觉模型的响应作为增强上下文，主模型仍正常使用工具、思考等

### Decision 3: API Key 来源

视觉模型的 API key 获取优先级：
1. `config.vision.key`（通过 `/config vision-key` 设置）
2. `getEnvApiKey(visionProvider)` → 如 Qwen → `DASHSCOPE_API_KEY`
3. 若上述都为空，fallback 到主模型的 `config.apiKey`
支持 `/config vision-key` 命令，允许视觉模型使用与主模型不同的 API key。

### Decision 4: 错误处理与降级

| 场景 | 行为 |
|------|------|
| 视觉模型已配置，但 `resolveModel` 失败 | 打印 warning，降级到 OCR |
| 视觉模型 API 调用失败 | 打印 warning，降级到 OCR |
| 视觉模型已配置，但 API key 未设置（配置和环境变量都为空） | 打印 warning，降级到 OCR |
| 视觉模型未配置，主模型支持 image | 主模型原生处理（现有行为） |

### Decision 5: 视觉模型调用方式

使用 `pi-ai` 的 `streamSimple` 进行一次性调用（非流式），因为视觉模型的输出不需要实时展示给用户 — 它只是一个中间步骤。调用参数：
- 不启用 reasoning/thinking（看图说话不需要深度推理）
- maxTokens 限制在 4096 以内（图片描述不需要太长）
- 不使用 tools

## Risks / Trade-offs

- **[Risk] 视觉模型调用增加延迟**: 图片请求需要两次 LLM 调用（视觉模型 → 主模型）
  → Mitigation: 视觉模型使用较小的 maxTokens 减少耗时；无图片请求完全不受影响
  
- **[Risk] 视觉模型 API key 缺失导致静默降级**: 用户配置了视觉模型但 key 未设置
  → Mitigation: 在启动时检查并打印 warning；降级时也打印提示
  → Mitigation: 支持 `/config vision-key` 独立配置；在启动时检查并打印 warning；降级时也打印提示
- **[Risk] 视觉模型与主模型对图片的理解不一致**: 视觉模型看到的内容可能与主模型原生看图有偏差
  → Mitigation: 视觉模型使用标准 prompt "请详细描述这张图片的内容，包括文字、布局和视觉元素"

## Open Questions

- 是否需要在 `/config` 输出中显示当前视觉模型配置状态？（建议：是，放在 `/config` 默认输出中）
