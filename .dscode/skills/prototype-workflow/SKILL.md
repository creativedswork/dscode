---
name: prototype-workflow
description: HTML prototype generation workflow for frontend UI exploration. Load this skill (which auto-loads html-output) before generating any HTML prototype. Specifies output directory, naming convention, style alignment, and iteration flow.
license: MIT
compatibility: Requires html-output skill. Designed for dscode web frontend design system.
metadata:
  version: "1.0"
requires:
  - html-output
---

# Prototype 产出规范

在 explore 阶段讨论前端 UI 后生成 HTML 原型时的完整流程和约束。

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
5. 在原型上直接接收视觉反馈并迭代，直到用户确认
6. 确认后将最终设计决策写入对应 change 的 `design.md` / `specs`

## 生命周期

- 原型**保留不删**，作为后续迭代和未来 changes 的视觉参考
- change 归档后原型仍保留在 `docs/prototypes/` 中
- 当文件过时或不再适用时，由开发者手动清理

## 参考案例

- **Session 00MRIZMZQJ**: `docs/prototypes/mcp-toolcard-execution-view-prototype.html` — 完整展示了"HTML 原型→视觉迭代→捕获决策→实现"的标准流程

## 依赖

本 skill 声明依赖 `html-output` skill。加载本 skill 时自动加载 `html-output`。
