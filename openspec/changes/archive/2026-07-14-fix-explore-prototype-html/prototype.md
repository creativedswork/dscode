## Visual Direction

This change introduces a **constraint file** (`docs/prototypes/prototype.md`) that governs how HTML prototypes are generated. The file itself is markdown, but it acts as a design brief for the `html-output` skill — specifying output format, style alignment, and directory conventions.

**Tone**: Technical but readable. Like a style guide / developer doc hybrid.

## Layout

```
docs/
  prototypes/
    prototype.md          ← 约束文件（本 artifact 的设计对象）
    <name>-<desc>.html    ← 实际 HTML 原型（由约束文件指导生成）
```

### Constraint File Structure (`prototype.md`)

```
┌─ prototype.md ────────────────────────────────────┐
│                                                     │
│  # Prototype 产出规范                                │
│                                                     │
│  ## 目录约定                                         │
│  - 产出目录: docs/prototypes/                         │
│  - 命名规范: <change-name>-<descriptor>.html         │
│                                                     │
│  ## 格式要求                                         │
│  - 自包含单文件 HTML（inline CSS + JS）              │
│  - 无需构建工具，浏览器直接打开                        │
│                                                     │
│  ## 风格对齐                                         │
│  - 读取 web/index.css 的 --color-* CSS 变量          │
│  - 字体: Geist Sans / Geist Mono                    │
│  - 遵循 warm-design-system 规范                       │
│                                                     │
│  ## 生成流程                                         │
│  - 必须加载 html-output skill                        │
│  - 生成前必须提取实际项目的 CSS 变量                   │
│  - 支持多状态切换按钮（便于视觉迭代）                   │
│                                                     │
│  ## 生命周期                                         │
│  - 原型保留不删，作为后续迭代的视觉参考                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Interaction Flow

```
Explore 讨论触及前端/UI 关键词
        │
        ▼
  Agent: "要不要出一个 HTML 原型？"
        │
    ┌───┴───┐
    │ No    │ → 继续 explore，不做原型
    └───────┘
        │ Yes
        ▼
  读取 docs/prototypes/prototype.md 获取约束
        │
        ▼
  加载 html-output skill
        │
        ▼
  提取 web/index.css 中的 --color-* 变量
        │
        ▼
  生成自包含 HTML → docs/prototypes/<name>.html
        │
        ▼
  用户在原型上反馈视觉调整
        │ （可多轮迭代）
        ▼
  确认后，决策写入 design.md / specs
```

## Design References

- **Session 00MRIZMZQJ**: 标准案例 — `mcp-toolcard-execution-view-prototype.html` 的生成→迭代→捕获流程
- **html-output skill**: `.claude/skills/html-output/SKILL.md`
- **Web UI design tokens**: `web/index.css` 中的 `--color-*` 变量
- **Archived reference**: `flat-message-redesign` 使用过 `web/prototypes/` 目录

## Accessibility Notes

- 原型 HTML 不要求完整的无障碍支持（原型不是生产代码）
- 但颜色对比度应大致可读（方便演示和讨论）
