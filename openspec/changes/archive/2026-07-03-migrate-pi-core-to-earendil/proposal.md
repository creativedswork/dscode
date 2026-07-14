## Why

`@mariozechner/pi-ai` (v0.73.1) 已停止更新，缺少 GLM 5.2 等新模型。`@earendil-works/pi-ai` (v0.80.3) 是同一作者的活跃 fork，已连续发布 27 个版本，包含 GLM 5.2 / GLM 5.1 / DeepSeek V4 Pro 等最新模型。同时 `@mariozechner/pi-agent-core` 也需同步迁移至 `@earendil-works/pi-agent-core`。

## What Changes

- **BREAKING**: 将 `@mariozechner/pi-ai` 替换为 `@earendil-works/pi-ai@0.80.3`
- **BREAKING**: 将 `@mariozechner/pi-agent-core` 替换为 `@earendil-works/pi-agent-core@0.80.3`
- **BREAKING**: 适配新 pi-ai 的 Models 实例 API——`getModel()`、`getProviders()`、`getModels()`、`streamSimple()`、`completeSimple()`、`complete()` 从独立函数变为 Models 实例方法
- 新增 GLM 5.2 模型支持（通过 pi-ai 内置的 zai/openrouter/opencode-go 等 provider）
- `@earendil-works/pi-tui` 无需变更（已在用）

## Capabilities

### New Capabilities
- `pi-core-migration`: 迁移至 @earendil-works/pi-ai + pi-agent-core，适配新 API 并确保 GLM 5.2 可用

### Modified Capabilities
<!-- 不需要修改现有 spec 的 requirement，所有改动均为实现层面适配 -->

## Impact

- **30 文件** — 全局替换 import 路径（`@mariozechner/pi-ai` → `@earendil-works/pi-ai` 等）
- **`src/models/registry.ts`** — 核心适配点：`getModel/getProviders/getModels` → Models 实例方法；对外接口（`resolveModel`、`getThinkingLevel`、`registerProvider`）保持不变
- **`src/core/harness.ts`** — `streamSimple` → Models 实例方法
- **`src/permissions/fuzzy-llm.ts`** — `complete` → Models 实例方法
- **`src/eval/`** — `completeSimple` → Models 实例方法
- **`src/core/config.ts`** — `getEnvApiKey` 导入路径确认
- **`src/drivers/vision/client.ts`** — `getEnvApiKey`、`streamSimple` 导入路径确认
- **`package.json`** — 更新依赖声明
