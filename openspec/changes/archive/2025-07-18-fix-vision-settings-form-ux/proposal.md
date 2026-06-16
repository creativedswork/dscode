## Why

在 Web UI Settings 面板中添加 Vision Model 后，配置表单立即消失，用户无法继续填写剩余字段（如 Model、API Key），也无法在配置完成后查看或修改已有的 Vision 设置。当前实现与 `vision-config-add-delete-ui` spec 的要求不一致：spec 要求 `config.vision` 存在时应始终展示完整的配置表单，但实际代码仅在 `showVisionForm === true` 时渲染表单字段，且 `useEffect` 在 `config.vision` 变为 truthy 的瞬间就将 `showVisionForm` 重置为 `false`，导致表单永久不可见。

## What Changes

- 修复 Vision Model 表单渲染逻辑：当 `config.vision` 已存在时，始终展示 provider/model/key 表单字段（由 `config.vision` 驱动），不再依赖 `showVisionForm` 状态
- `showVisionForm` 仅用于控制「从无到有」的添加流程（`config.vision` 为空时点击 "Add Vision Model" 展开空表单）
- 保证设置 provider 后表单不会关闭，用户可以继续设置 model 和 key
- 已配置的 vision model 可直接在表单中修改，无需先删除再重新添加

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `vision-config-add-delete-ui`: 修正表单可见性逻辑——当 `config.vision` 存在时必须渲染完整表单字段，而非仅显示 Delete 按钮

## Impact

- `web/src/components/Sidebar.tsx` — `SettingsPanel` 组件中的 Vision Model 条件渲染逻辑
- 不影响后端、协议、其他组件
