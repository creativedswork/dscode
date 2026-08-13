---
name: prototype-workflow
description: Generate and lifecycle-manage HTML prototypes for UI exploration and OpenSpec changes. Use when creating, validating, completing, or archiving a UI prototype.
license: MIT
compatibility: Requires html-output skill. Designed for dscode web frontend design system.
metadata:
  version: "1.0"
requires:
  - html-output
---

# Prototype 产出规范

前端 UI 变更在 explore 或 propose 阶段生成 HTML 原型时的完整流程和约束。
任何涉及可见组件、渲染、布局、CSS、交互或用户状态的变更都必须产出 HTML；
纯文字视觉说明不能替代原型，只有严格非 UI 变更才能使用 prototype stub。

## 触发条件

当 explore 讨论涉及以下关键词时触发：
UI, 页面, 界面, 组件, 交互, 样式, 视觉, CSS, frontend, landing, dashboard, 原型, prototype, redesign, 动效

## 目录约定

- **产出目录**: `docs/prototypes/`
- **命名规范**: `<change-name>-<descriptor>.html`
  - 示例: `mcp-tool-progress-execution-view.html`
  - 同一 change 的多个原型用不同 descriptor 区分

## 格式要求

- 自包含单文件 HTML（inline CSS + JS）
- 无需构建工具，浏览器直接打开即可预览
- 文件头部注释标注对应的 change name 和生成日期

## 风格对齐

- 读取 `web/index.css` 中的 `--color-*` CSS 自定义属性作为 design tokens
- 字体: Geist Sans（正文/UI） + Geist Mono（代码/工具名）
- 遵循 `warm-design-system` 规范（12px 圆角气泡、8px 面板、6px 按钮、`1px solid` 分割线、无阴影、无渐变）
- 色板参考:
  - 背景: `--color-bg` (#f8f7f5)
  - 表面: `--color-surface` (#f3f2ef)
  - 边框: `--color-border` (#e6e4e0)
  - 文字: `--color-text` (#2d2a26)
  - 强调: `--color-accent` (#ca8a04)

## 生成步骤

1. 读取 `docs/prototypes/README.md` 了解上下文
2. 提取 `web/index.css` 中的实际 CSS 变量值
3. 生成自包含 HTML → `docs/prototypes/<change-name>-<descriptor>.html`
4. HTML 文件必须包含多状态切换按钮（如 waiting / in-progress / done / error），便于视觉迭代
5. 在浏览器中打开原型，验证交互、控制台、亮暗主题和关键响应式状态
6. 在原型上直接接收视觉反馈并迭代，直到用户确认
7. explore 阶段确认后引导用户运行 `/opsx:propose`；propose 阶段则继续生成 prototype manifest

## 生命周期

`docs/prototypes/` 是 explore/propose 阶段的**暂存区**，不是永久归档目录。
原型在实现完成后必须逐文件判定，禁止默认永久保留。

### 实现完成后的判定

对当前 change 的每个 HTML 原型执行两道门：

1. **长期价值门**：至少满足一项
   - 定义可被后续 change 复用的跨功能交互或视觉契约；
   - 提供代码、测试和文字 Spec 无法等价表达的可执行状态矩阵或方案比较；
   - 是后续视觉回归、设计评审或架构讨论仍需直接运行的证据。
2. **有效性门**：必须全部满足
   - 与最终实现和当前 design tokens 一致；
   - 已完成浏览器验证；
   - 没有被更新版本替代；
   - 能明确归属到当前 OpenSpec change。

两道门都通过时标记 `archive`；否则标记 `delete`。无法确定时默认
`delete`，不要以“以后可能有用”为理由积累文件。

在当前 change 的 `prototype.md` 中维护：

```markdown
## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/<file>.html` | `archive` 或 `delete` | 具体依据 |
```

- `delete`：在实现完成、验证通过后立即删除 HTML，移除
  `docs/prototypes/README.md` 索引，并更新当前 change 中的引用，禁止留下断链。
- `archive`：apply 阶段继续留在暂存区；到 OpenSpec archive 阶段移动到
  `docs/prototypes/archive/YYYY-MM-DD-<change-name>/`，更新仓库内所有引用后提交。
- 实现未完成或仍在进行视觉反馈时不得提前删除。

## Validation

Verify before reporting completion:

apply 完成时确认每个原型都有最终 decision，且所有 `delete` 文件已不存在。
archive 完成时确认所有 `archive` 文件位于归档目录、暂存区无当前 change 的残留，
并使用文本搜索确认仓库中不存在指向旧路径的引用。

## 参考案例

- **Session 00MRIZMZQJ**: `docs/prototypes/archive/2026-07-14-fix-explore-prototype-html/mcp-toolcard-execution-view-prototype.html` — 完整展示了"HTML 原型→视觉迭代→捕获决策→实现"的标准流程

## 依赖

本 skill 声明依赖 `html-output` skill。加载本 skill 时自动加载 `html-output`。
