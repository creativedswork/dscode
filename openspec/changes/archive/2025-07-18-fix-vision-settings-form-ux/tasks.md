## 1. Fix Vision Model form rendering

- [x] 1.1 修改表单字段条件渲染：将 `{showVisionForm && (<>form fields</>)}` 改为 `{(showVisionForm || config.vision) ? (<>form fields</>)}`，使表单在 `config.vision` 存在时始终可见
- [x] 1.2 删除 `useEffect` 中 `showVisionForm` 自动复位逻辑（line 427-431），避免 config push 后表单被强制关闭
- [x] 1.3 确保表单字段值由 `config.vision` 驱动：provider dropdown 使用 `config.vision?.provider ?? ""`，model dropdown 使用 `config.vision?.model ?? ""`，API Key placeholder 在已配置时显示 `"••••••••"`
- [x] 1.4 验证 Cancel 按钮仅在 `!config.vision && showVisionForm` 时渲染（已有逻辑，确认不变）
- [x] 1.5 确认 Delete 按钮在 `config.vision` 存在且非 add 模式时渲染（已有逻辑，确认不变）

## 2. Add Vision Model flow 验证

- [x] 2.1 端到端测试：无 vision config 时点击 Add → 展开空表单 → 选择 provider → 表单持续可见 → 选择 model → 设置 key → 所有字段可正常修改
- [x] 2.2 测试 Cancel 按钮：config.vision 为空时点击 Add → 点 Cancel → 表单消失，回到 Add 按钮
- [x] 2.3 测试 Delete 按钮：已配置 vision 时 → 点 Delete → config.vision 清除，回到 Add 按钮
- [x] 2.4 测试编辑已配置项：已配置 vision 时 → 修改 provider/model/key → 各字段可正常修改并发送变更
