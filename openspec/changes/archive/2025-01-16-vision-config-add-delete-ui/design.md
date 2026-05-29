## Context

当前 Web UI Settings 面板中 Vision Model 配置区块**始终渲染**，不管 `config.vision` 是否已配置。用户没有一键添加/删除 vision 配置的入口 — 未配时看到三个 `(not set)` 占位字段，已配后也无法一键清除。

`config.vision` 在后端的判定逻辑（`core/config.ts` L171）：只有 provider 和 model **同时存在**时才是有效配置，否则为 `undefined`。Web UI 目前没有利用这个信号做条件渲染。

## Goals / Non-Goals

**Goals:**
- Vision 未配置时，Settings 底部显示 `[+ Add Vision Model]` 按钮
- 点击按钮展开配置 UI，用户可配置 provider / model / key
- 配置完成后显示完整 UI，提供 `[Delete]` 一键清除入口
- 新增 `set_vision_delete` 协议命令，持久层支持 key 删除

**Non-Goals:**
- 不改变 TUI 的 `/config vision-*` 行为（可选跟进）
- 不改变 vision 在 agent 中的使用逻辑（何时调用 vision model）
- 不影响 `core/config.ts` 中 vision 配置的加载/判定逻辑

## Decisions

### 1. 条件渲染判断：`config.vision == null`

用 `config.vision == null` 判断是否已配置。这与后端逻辑一致：`vision` 只有 `{ provider, model, key? }` 或 `undefined` 两种状态，不存在中间态（如只设了 provider 但 model 为空）。

当前 `set_vision_provider` 会立即创建一个 `{ provider, model: "" }` 对象，这会导致 `vision` 从 `undefined` 变为 truthy（`{}` 是 truthy）。因此 Add 按钮被点击后**不需要额外的展开/收起 state** — 用户选择 provider 的瞬间，后端返回的 config 就带上了 `vision`，前端会自动切换到完整 UI。

### 2. Add 按钮实现方式

Add 按钮不预先展开空表单，而是直接暴露一个 provider dropdown（省略中间的"空白展开"步骤）。但最简单的实现是：Add 按钮点击后设置一个本地 `showVisionForm` state，渲染与已配置状态相同的完整表单（provider / model / key），区别只是初始值为空。

**选择**：用本地 state `showVisionForm`。原因：
- 用户体验更流畅：点击 Add 后立刻看到所有选项，而非选了 provider 后才能看到 model
- 无需改动后端行为（`set_vision_provider` 仍保持现有语义）
- 当后端推送新 config 且 `vision != null` 时，重置 `showVisionForm = false`（由 config 驱动）

### 3. `set_vision_delete` 协议

新增 `ClientCommand` variant：
```ts
| { type: "config"; action: "set_vision_delete" }
```
无需 `value` 字段 — 删除操作不需要参数。

### 4. `saveUserConfig` 的 null 语义

现有 `saveUserConfig` 用 `{ ...existing, ...partial }` 合并，无法删除 key。新增规则：**partial 中值为 `null` 的 key，在合并后从结果中删除**。

```ts
export function saveUserConfig(partial: Record<string, unknown>): void {
  const path = userConfigPath();
  const existing = loadUserCommandConfig();
  const merged = { ...existing, ...partial };
  for (const [k, v] of Object.entries(partial)) {
    if (v === null) delete merged[k];
  }
  saveJsonSafe(path, merged);
}
```

### 5. Delete 按钮位置

Delete 按钮放在 Vision 配置区块的底部（Vision Key 下方），与整个区块一起通过 `borderTop` 分隔线与下方 Info 区块隔开。样式为 danger 色调（`var(--color-error-text)`）。

## Risks / Trade-offs

- **[Risk] `saveUserConfig` null 语义变更影响其他调用方** → 当前所有调用方都传非 null 值（string/object），无风险。未来调用方需知晓此约定。
- **[Risk] 用户点击 Add 后又手动关闭（不配置）** → 可在表单右上角加一个取消按钮（X），重置 `showVisionForm`。不实现也能接受 — 用户只需不填即可，不影响已保存配置。
- **[Trade-off] Add 展开后是本地 state，如果 WebSocket 推送新 config 时本地 state 还在显示表单** → useEffect 监听 `config.vision`：当它变为非 null 时清除 `showVisionForm`，UI 由 config 驱动。
