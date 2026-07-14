## 1. 依赖更新

- [x] 1.1 修改 `package.json`：`@mariozechner/pi-ai@^0.73.1` → `@earendil-works/pi-ai@^0.80.3`
- [x] 1.2 修改 `package.json`：`@mariozechner/pi-agent-core@^0.73.1` → `@earendil-works/pi-agent-core@^0.80.3`
- [x] 1.3 运行 `npm install` 安装新依赖

## 2. Import 路径迁移

- [x] 2.1 全局替换：所有 `from "@mariozechner/pi-ai"` → `from "@earendil-works/pi-ai"`（~30 文件）
- [x] 2.2 全局替换：所有 `from "@mariozechner/pi-agent-core"` → `from "@earendil-works/pi-agent-core"`（~17 文件）

## 3. Models 单例与 registry 适配

- [x] 3.1 在 `src/models/registry.ts` 中创建全局 `Models` 单例（`createModels()`）
- [x] 3.2 将 `getModel()` → `models.getModel()`（`resolveModel` 中）
- [x] 3.3 将 `getProviders()` → `models.getProviders()`（`getAllProviders` 中）
- [x] 3.4 将 `getModels()` → `models.getModels()`（`getAllModels` 中）

## 4. Stream/Complete 包装函数

- [x] 4.1 在 `src/models/index.ts` 中导出 `streamSimple` 包装函数
- [x] 4.2 在 `src/models/index.ts` 中导出 `completeSimple` 包装函数
- [x] 4.3 在 `src/models/index.ts` 中导出 `complete` 包装函数
- [x] 4.4 验证 `getEnvApiKey` 导出路径，如需则从子路径重新导出

## 5. 调用方适配

- [x] 5.1 `src/core/harness.ts`：`streamSimple` → 从 `../../models/index.js` 导入
- [x] 5.2 `src/permissions/fuzzy-llm.ts`：`complete` → 从 `../../models/index.js` 导入
- [x] 5.3 `src/eval/llm.ts`：`completeSimple` → 从 `../../models/index.js` 导入
- [x] 5.4 `src/eval/rules/extraction.ts`：`completeSimple` → 从 `../../models/index.js` 导入
- [x] 5.5 `src/eval/rules/store.ts`：`completeSimple` → 从 `../../models/index.js` 导入
- [x] 5.6 `src/drivers/vision/client.ts`：`streamSimple`、`getEnvApiKey` → 从 models 模块导入
- [x] 5.7 `src/core/config.ts`：`getEnvApiKey` → 从 models 模块导入
- [x] 5.8 其余仅需 import 路径替换的文件（`image-manager.ts`、`types.ts`、`events.ts` 等）确认无其他 API 变化

## 6. 验证

- [x] 6.1 运行 `npm run typecheck` 确保无类型错误
- [x] 6.2 运行 `npm test` 确保现有测试通过
- [x] 6.3 手动验证 GLM 5.2 模型可通过 `resolveModel` 解析
- [x] 6.4 手动验证 `streamSimple` / `completeSimple` / `complete` 包装函数可正常工作
- [x] 6.5 手动验证 Qwen 自定义 provider 仍可用
