## Why

platform.kimi.com 申请的 Kimi API key 只能用于 Moonshot API (`api.moonshot.cn`)，无法用于 pi-ai 内置的 `kimi-coding` provider（其 baseUrl 为 `api.kimi.com/coding`）。但同一个 k3 模型在 `moonshotai-cn` provider 下完全可用。用户需要一个直观的 provider 名称（`kimi`）来无缝使用自己的 key，而不必知道 `moonshotai-cn` 这个内部命名。

## What Changes

- **新增 `kimi` provider**：在 `registry.ts` 中注册一个自定义 provider，baseUrl 指向 `https://api.moonshot.cn/v1`，使用 openai-completions 协议
- **双 env var 支持**：auth 同时检查 `KIMI_API_KEY` 和 `MOONSHOT_API_KEY`，优先使用前者（兼容已有配置）
- **模型映射**：provider 内部将 model ID `k3` 映射为 Moonshot API 所需的 `kimi-k3`
- **保留 pi-ai built-in `kimi-coding`**：不做覆盖，用户仍可通过 `kimi-coding` 访问原生端点（如有对应 key）

## Capabilities

### New Capabilities

- `kimi-platform-provider`: 新增 `kimi` provider，将 platform.kimi.com 的 API key 桥接到 Moonshot API，用户可通过 `AGENT_PROVIDER=kimi AGENT_MODEL=k3` 使用 Kimi K3 模型

### Modified Capabilities

- `model-registry`: `PROVIDER_ENV_VARS` 和 `API_KEY_ENV_VARS` 新增 `kimi` 条目，映射到 `KIMI_API_KEY` / `MOONSHOT_API_KEY`

## Impact

- `src/models/registry.ts` — 新增 `kimi` provider 的 `createProvider()` 调用和 `models.setProvider()`
- `src/core/config.ts` — `PROVIDER_ENV_VARS` 新增 `kimi` 条目
- 不影响现有 `kimi-coding` 和 `moonshotai-cn` provider 的行为
