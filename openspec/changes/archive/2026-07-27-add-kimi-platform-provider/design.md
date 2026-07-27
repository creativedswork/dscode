## Context

pi-ai 0.80.10 内置了两个 Kimi 相关 provider：

- `kimi-coding`：baseUrl `https://api.kimi.com/coding`，Anthropic Messages 协议，需要专属 key（非 platform.kimi.com 所发）
- `moonshotai-cn`：baseUrl `https://api.moonshot.cn/v1`，OpenAI Completions 协议，接受 platform.kimi.com 的 API key

两个 provider 都包含 k3 模型（`kimi-coding` 下叫 `k3`，`moonshotai-cn` 下叫 `kimi-k3`），核心能力完全一致（1M context、128K maxTokens、reasoning + image input）。

dscode 已有 Qwen 自定义 provider 的先例（`src/models/qwen.ts`），通过 `createProvider()` + `models.setProvider()` 注册到 pi-ai 实例。

## Goals / Non-Goals

**Goals:**
- 新增 `kimi` provider，让用户用 `AGENT_PROVIDER=kimi` 即可使用 platform.kimi.com 的 key
- 内部 model ID `k3` 映射为 Moonshot API 所需的 `kimi-k3`
- 同时支持 `KIMI_API_KEY` 和 `MOONSHOT_API_KEY` 两个环境变量
- 保留 pi-ai built-in `kimi-coding`（不做覆盖）

**Non-Goals:**
- 不覆盖或修改 pi-ai 内置的 `kimi-coding` provider
- 不添加 k3 以外的其他 Kimi 模型
- 不涉及 TUI/Web 前端变更

## Decisions

### D1: 新增独立 provider `kimi`，不覆盖 `kimi-coding`

**Why**：保留 pi-ai 原生 `kimi-coding` provider，让拥有 `api.kimi.com/coding` 有效 key 的用户仍可使用。`kimi` 作为直观的别名 provider，面向 platform.kimi.com 用户。

**Alternatives considered**：
- *覆盖 `kimi-coding`*：会让拥有原生 coding key 的用户丧失能力，且 model ID `k3` vs `kimi-k3` 需要不透明的映射。

### D2: openai-completions 协议 + deepseek thinking format

**Why**：Moonshot API 使用 OpenAI Completions 协议，pi-ai 的 `moonshotai-cn` provider 已验证该协议下 k3 的 thinking（`thinkingFormat: "deepseek"`）和 tool calling（`deferredToolsMode: "kimi"`）均正常工作。

**Alternatives considered**：
- *Anthropic Messages 协议*：`api.moonshot.cn` 不支持该协议端点。

### D3: 双 env var 支持（KIMI_API_KEY 优先，MOONSHOT_API_KEY 兜底）

**Why**：`KIMI_API_KEY` 是用户直觉上会设置的环境变量名，`MOONSHOT_API_KEY` 是 pi-ai `moonshotai-cn` provider 的标准变量名。`envApiKeyAuth` 按顺序遍历数组，第一个命中的 env var 生效。

### D4: model ID 映射 `k3` → `kimi-k3`

**Why**：`api.moonshot.cn` 只接受 `kimi-k3` 这个 model ID。provider 的 model 定义中 `id` 字段填写 API 所需的值（`kimi-k3`）。pi-ai 的 `resolveModel` 按 provider 的 model `id` 查找，用户传入 `k3` 时需在 model 定义中注册 `id: "kimi-k3"` 同时在 `getAllModels` 中外显为 `k3`。

实际上对标 pi-ai 的 `moonshotai-cn` provider，model ID 直接使用 `kimi-k3`（用户用 `AGENT_MODEL=kimi-k3`），避免额外的映射层。`kimi-k3` 作为 model ID 对外暴露，清晰且一致。

### D5: 参考 Qwen 模式，在 `registry.ts` 模块顶层注册

**Why**：Qwen provider 在 `registry.ts` 模块初始化时通过 `createProvider()` + `models.setProvider()` 注册到 pi-ai 实例。Kimi 采用完全相同的模式，代码结构一致。

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| `models.setProvider("kimi", ...)` 与 pi-ai 未来新增的 `kimi` built-in provider 冲突 | pi-ai 目前无 `kimi` provider，且新增 provider 通常是加后缀（如 `kimi-coding`），直接命名为 `kimi` 的可能性极低。即使冲突，`setProvider` 覆盖行为是预期内的 |
| `kimi-k3` model ID 与 `kimi-coding` 下的 `k3` 不统一 | 在 `getAllModels("kimi")` 中返回 `{ id: "kimi-k3", name: "Kimi K3" }`，用户看到的是完整名称，不产生歧义 |
| Moonshot API 的 `supportsReasoningEffort: false` 导致 thinking 无法指定 effort level | pi-ai 在 `thinkingFormat: "deepseek"` 路径下仅发送 `thinking: { type: "enabled" }`，模型自行决定 thinking 程度，与前文的 `max` effort 语义一致 |
