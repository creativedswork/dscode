## Context

dscode 目前依赖 `@mariozechner/pi-ai@0.73.1` 和 `@mariozechner/pi-agent-core@0.73.1`。这两个包已停止更新，缺少 GLM 5.2 等新模型。

`@earendil-works/pi-ai@0.80.3` 是同一作者（badlogic/Mario Zechner）的活跃 fork，已在 npm 上连续发布 27 个版本。它包含了 GLM 5.2 / GLM 5.1 等模型，但**架构从全局单例函数切换为 Models 实例模式**——`getModel()`、`getProviders()`、`getModels()`、`streamSimple()`、`completeSimple()`、`complete()` 不再是独立导出，而是 Models 实例的方法。

dscode 对这些函数的调用分散在 7 个文件中。好消息是 dscode 已有 `src/models/registry.ts` 作为对 pi-ai 的封装层，可以集中处理这次 API 变化。

## Goals / Non-Goals

**Goals:**
- 将 `@mariozechner/pi-ai` → `@earendil-works/pi-ai@0.80.3`
- 将 `@mariozechner/pi-agent-core` → `@earendil-works/pi-agent-core@0.80.3`
- 适配 Models 实例 API，保持 `registry.ts` 对外接口不变
- GLM 5.2 模型可通过 pi-ai 内置 provider 解析使用

**Non-Goals:**
- 不新增 native Zhipu（智谱）provider——使用 pi-ai 内置的 zai/openrouter/opencode-go 等
- 不修改 `model-registry` spec 的 requirement（仅实现层面适配）
- 不修改 `@earendil-works/pi-tui`（已在用）

## Decisions

### Decision 1: 在 registry.ts 中创建全局 Models 单例

pi-ai 0.80.3 导出 `createModels()` 工厂函数创建 `Models` 实例。我们在 `src/models/registry.ts` 中创建一个模块级单例：

```ts
import { createModels } from "@earendil-works/pi-ai";

const models = createModels();
```

然后将 `getModel()`、`getProviders()`、`getModels()` 的调用从独立函数改为 `models.getModel()` 等实例方法。

**替代方案**：在每个调用点创建 Models 实例。❌ 拒绝——增加复杂度，无收益。

### Decision 2: 保持 registry.ts 对外接口不变

`resolveModel()`、`getThinkingLevel()`、`registerProvider()`、`getAllProviders()`、`getAllModels()`、`getVisionModels()`、`getVisionProviders()` 这些对外函数签名和行为不变。调用方（harness.ts、web-backend 等）无需修改。

**替代方案**：直接暴露 Models 实例。❌ 拒绝——破坏现有封装，增加所有调用方的改动量。

### Decision 3: harness.ts 中的 streamSimple 通过 registry 暴露

`harness.ts` 中 `streamSimple` 的调用改为通过 registry 导出的包装函数。类似于 Decision 2，保持 harness 其余代码不变。

### Decision 4: eval/ 中的 completeSimple 通过 registry 暴露

`src/eval/` 下三个文件调用 `completeSimple()`——同样通过 registry 导出包装函数。

### Decision 5: `getEnvApiKey` 直接重新导出

`getEnvApiKey` 在 0.80.3 中仍存在（从 `env-api-keys.ts` 导出），但需要确认主 index 是否重新导出。如未导出，从子路径直接导入。

## Risks / Trade-offs

- **[风险] pi-agent-core API 不兼容** → **缓解**: 已验证 `Agent`、`AgentTool`、`AgentMessage`、`AfterToolCallContext` 等关键类型均存在于 0.80.3，签名一致
- **[风险] `getEnvApiKey` 签名变化** → **缓解**: 新版本增加可选 `env` 参数（`getEnvApiKey(provider, env?)`），向后兼容
- **[风险] pi-ai 内置 provider 集合变化** → **缓解**: `getProviders()` 返回所有内置 provider。Qwen 等自定义 provider 仍通过 `registerProvider()` 注册，不受影响
- **[权衡] Models 单例** → 当前 dscode 是单进程 CLI 工具，单例无并发问题。未来如需多租户可重构

## Open Questions

- ~~`@earendil-works/pi-ai@0.80.3` 的主 index 是否重新导出 `getEnvApiKey`？~~ → 实施时验证
