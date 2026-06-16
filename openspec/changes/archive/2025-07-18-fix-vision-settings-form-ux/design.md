## Context

当前 `SettingsPanel` 的 Vision Model 区域有三种 UI 状态，但渲染逻辑将它们压缩成了两种：

- **A**: `config.vision` 为空 + `showVisionForm=false` → "Add Vision Model" 按钮
- **B**: `config.vision` 为空 + `showVisionForm=true` → 空表单 + Cancel
- **C**: `config.vision` 存在 → 应展示完整表单（由 config.vision 驱动）+ Delete

问题在于状态 C 的渲染错误地依赖了 `showVisionForm`：当 `config.vision` 存在且 `showVisionForm=false` 时，仅渲染 Delete 按钮而不渲染表单字段。此外，`useEffect` 在 `config.vision` 从空变为非空的瞬间就将 `showVisionForm` 设为 `false`，导致从状态 B 过渡到 C 时表单字段消失。

## Goals / Non-Goals

**Goals:**
- 状态 C 始终渲染完整的 provider/model/key 表单字段，不依赖 `showVisionForm`
- 从状态 B → C 的过渡平滑：设置 provider 后表单继续显示，用户可继续设置 model 和 key
- 已配置的 vision model 可直接修改（provider/model/key 均可编辑）

**Non-Goals:**
- 不改变后端 config 处理逻辑
- 不改变 WebSocket 协议
- 不改变 Settings panel 其他区域（Provider/Model/Thinking/API Key 等）

## Decisions

### 决策：表单字段渲染由 `config.vision` 的存在性直接控制

**方案**：将 `{showVisionForm && (<>form fields</>)}` 改为 `{showVisionForm || config.vision ? (<>form fields</>)}`，表单值始终由 `config.vision?.provider` / `config.vision?.model` / `config.vision?.key` 驱动（当 config.vision 不存在时显示空值）。

**替代方案考虑**：
- *增加独立的 `isEditing` 状态*：增加复杂度，且 config.vision 本身已携带足够信息来驱动表单。
- *保留 showVisionForm 控制并增加 Edit 按钮*：多一步操作，用户体验更差。

**选择理由**：最小改动，复用现有表单结构，`config.vision` 存在即可见、可编辑。

### 决策：移除 useEffect 中的 `showVisionForm` 自动复位

当前逻辑（line 427-431）：
```tsx
useEffect(() => {
  if (config?.vision) setShowVisionForm(false);
}, [config?.vision]);
```

**方案**：删除此 useEffect。表单始终由 `config.vision` 驱动显示，`showVisionForm` 仅用于「config.vision 为空时手动点 Add」的场景。

**替代方案**：*保留但延迟复位* —— 复杂且不可靠，因为用户可能在任何顺序下填写字段。

## Risks / Trade-offs

- [Risk] 删除 `showVisionForm` 自动复位后，用户在 config.vision 为空时手动展开的空表单不会自动关闭，需要点 Cancel 或等 config push → **Mitigation**: Cancel 按钮已在「`!config.vision && showVisionForm`」条件下渲染，功能正常。
- [Trade-off] `showVisionForm` 和 `config.vision` 两个状态源有时会同时为 true（config push 到达前） → 不影响渲染，表单字段由 `config.vision` 值驱动，`showVisionForm` 仅控制 Cancel 按钮显隐。
