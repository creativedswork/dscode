## Why

当前系统只支持配置单一模型（主模型），当用户输入图片时，若主模型不支持多模态（如 DeepSeek），只能回退到本地 Tesseract OCR 提取文字。OCR 质量远不如视觉模型直接理解图片语义。用户希望能配置一个独立的视觉模型（如 Qwen、Kimi），在需要图片理解时自动切换，无需手动切换 provider/model，也不会丢失主模型（如 DeepSeek）的代码理解和推理能力。

## What Changes

- 新增 `vision: { provider, model, key }` 嵌套配置对象，保存在 `~/.dscode/config.json` 中
- 新增 `/config vision-provider <id>`、`/config vision-model <id>`、`/config vision-key <key>` 命令
- 图片输入时的模型选择逻辑：
  1. 若已配置视觉模型 → 使用视觉模型处理当前请求
  2. 若未配置视觉模型，但主模型本身支持 `image` 输入 → 直接用主模型
  3. 若未配置视觉模型，主模型也不支持 `image` → 回退到 OCR（**现有行为不变**）
- 视觉模型仅在包含图片的请求中临时使用；无图片的请求继续使用主模型，不受影响
- `Harness.promptAndSave` 和 TUI/Web 的图片处理流程需要感知视觉模型配置并路由到正确的模型

## Capabilities

### New Capabilities

- `vision-model-config`: 视觉模型配置的存储、加载、CLI 命令和模型路由逻辑

### Modified Capabilities

- `model-registry`: 视觉模型的选择依赖 `resolveModel` 和 `getAllModels`，但接口不变；只是多了一个调用场景（用 vision provider/model 调用 resolveModel）

## Impact

- `src/core/config.ts`: 新增 `vision` 配置对象的加载和保存
- `src/core/types.ts`: `HarnessConfig` 新增 `vision?: { provider: string; model: string; key?: string }` 字段
- `src/core/harness.ts`: `promptAndSave` 和图片路由逻辑需要根据视觉模型配置决定实际使用的模型
- `src/ui/commands.ts`: 新增 `/config vision-provider` / `/config vision-model` / `/config vision-key` slash commands
- `src/ui/tui-app.ts`: `handleSubmit` 中的模型能力判断逻辑需要适配
- `src/ui/web/web-backend.ts`: `handleMessage` chat case 中同样需要适配；`buildConfigData()` 需包含 vision 配置；config action 需处理 vision 子命令
- `src/ui/web/protocol.ts`: `ConfigData` 新增 `vision` 字段；`ClientCommand` 新增 `set_vision_provider` / `set_vision_model` / `set_vision_key` action
- `web/src/types/index.ts`: 与 server 端 protocol 同步更新
- `web/src/components/Sidebar.tsx`: Settings 面板新增 vision provider/model/key 输入
- `web/src/components/App.tsx`: 处理新增的 vision config actions
