## Visual Direction

延续现有 warm design system（`--color-*` tokens），无新增视觉风格。Cache 区块使用与 Settings 面板其他区块一致的布局：label + bordered block + helper text。

- **颜色**: `--color-bg` 底、`--color-border` 边框，大容量时 border 变为 `--color-error-text`
- **排版**: 缓存大小用 mono 字体（`Geist Mono`），16px bold；标签 11px muted
- **间距**: 与其他 settings-block 一致（mb: 16px，内 padding: 10px 12px）

## Layout

```
┌──────────────────────────────┐
│  Sessions │ MCP │ Settings   │
├──────────────────────────────┤
│  Provider          [select]  │
│  Model             [select]  │
│  Thinking Level    [select]  │
│  API Key       [input][Set]  │
│  Project Path  [input][Set]  │
│  ─────────────────────────── │
│  Upload Cache                │  ← 新增
│  ┌──────────────────────┐    │
│  │ 47 MB        [Clear] │    │
│  │ 23 files · 5 sess.   │    │
│  └──────────────────────┘    │
│  Files in .dscode/uploads/   │
│  ─────────────────────────── │
│  Max Tokens: 131,072         │
└──────────────────────────────┘
```

## Interaction Flow

```
   Settings 打开
        │
        ▼
  自动请求 cache_size ──▶ 显示 "..." loading
        │
   收到 cache_size 事件
        │
        ▼
  显示 "X MB" / "X files · X sessions"
        │
  用户点 [Clear]
        │
        ▼
  发送 clear_cache 命令 ──▶ 显示 "clearing..."
        │
   服务端清完，推送 cache_size (0 B)
        │
        ▼
  显示 "0 B" / Clear button disabled
```

**状态列表**:
- **empty**: `0 B`，Clear 禁用
- **normal** (≤50MB): 正常显示，Clear 可用
- **warning** (>50MB): 红色边框 `danger` class，helper 改 "Consider clearing to free disk space"
- **loading**: `...` + 脉冲动画
- **clearing**: `...` + 脉冲动画 → 自动跳 empty

## Design References

- 原型: `docs/prototypes/settings-cache-management.html`
- 现有 SettingsPanel: `web/src/components/Sidebar.tsx` lines 403-686
- Design tokens: `web/src/index.css`

## Accessibility Notes

- Clear 按钮使用 `--color-error-text` 红色，在亮/暗模式下对比度均达标
- 禁用状态 opacity 0.4 作为视觉提示，同时 `cursor: not-allowed`
- loading/clearing 状态用 CSS animation（无闪烁风险）
