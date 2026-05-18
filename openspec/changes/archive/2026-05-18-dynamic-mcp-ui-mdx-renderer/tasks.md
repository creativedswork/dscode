## 1. MDX Parser

- [x] 1.1 创建 `src/ui/mdx/mdx-runtime.js` — 实现 tag 解析器，支持 `<Chart/>`, `<Metrics/>`, `<Table/>`, `<Slider/>`, `<Card/>`, `<Row/>` 标签识别，支持 `data={key}` 和 `data={[sub, key]}` 数据绑定语法
- [x] 1.2 支持属性值：字符串 `"foo"`、数字 `123`、数组 `["a","b"]`、变量绑定 `{key}`、嵌套绑定 `{key.sub}`
- [x] 1.3 处理自闭合标签 `<X/>` 和带子元素标签 `<Card>...</Card>`
- [x] 1.4 未知标签渲染为 placeholder div，不中断解析

## 2. MDX Components

- [x] 2.1 创建 `src/ui/mdx/mdx-runtime.js` — 实现 6 个内置组件（Chart/Canvas、Metrics/Cards、Table/HTML table、Slider/input range、Card/div wrapper、Row/flex container）
- [x] 2.2 Chart 组件：使用 Canvas 2D API，支持 `type="line"` 和 `type="bar"`，自动计算坐标轴范围，支持多 Y 轴字段
- [x] 2.3 Metrics 组件：grid 布局渲染 key-value 卡片，数值自动格式化（fmtCurrency）
- [x] 2.4 Table 组件：从数据第一行推断列名，支持排序（可选）
- [x] 2.5 Slider 组件：绑定到 data 对象的字段，oninput 时更新数据并触发关联 Chart/Table 重渲染
- [x] 2.6 所有组件使用 CSS 变量（`var(--bg)`, `var(--text)` 等）支持 light/dark 主题

## 3. MDX Renderer

- [x] 3.1 创建 `src/ui/mdx/mdx-runtime.js` — 实现 `renderMDX(mdx: string, data: object, container: HTMLElement)` 主入口
- [x] 3.2 数据上下文：解析所有 `{key.sub}` 绑定为实际数据值，传递给组件
- [x] 3.3 响应式更新：Slider 值变化时触发 bound components 重渲染
- [x] 3.4 错误处理：解析失败或数据绑定缺失时显示 fallback 信息，不白屏

## 4. Auto-Layout Inference

- [x] 4.1 创建 `src/ui/mdx/inference.ts` — 实现 `inferLayout(structuredContent: object, toolDescription?: string): { mdx: string }`
- [x] 4.2 规则 1：检测 key-value 数值对象 → `<Metrics>`
- [x] 4.3 规则 2：检测 object array 带 numeric 字段 → `<Table rows={...}/>`
- [x] 4.4 规则 3：检测 object array 带 sequential 字段（month/date/step） → `<Chart>` + `<Table>`
- [x] 4.5 规则 4：复合数据结构 → 组合 Chart + Metrics + Table
- [x] 4.6 优先使用 `_ui.mdx` override（如果 Server 提供）
- [x] 4.7 添加 title 信息（使用 tool description 或 tool name）

## 5. Sandbox 集成

- [x] 5.1 修改 `src/apps/sandbox.html` — 内联 MDX Runtime bundle，支持 data mode 路径
- [x] 5.2 修改 `scripts/build.mjs` — 复制 mdx-runtime.js 到 dist
- [x] 5.3 sandbox.html 启动时检测模式：有 `?mdx=` URL param → 数据模式；有 `?html=` → 传统模式
- [x] 5.4 数据模式：调用 `renderMDX(mdxSource, mdxData, container)` 渲染 UI

## 6. Host 集成

- [x] 6.1 修改 `src/mcp/app-types.ts` — AppInstance 新增可选字段：`mdx?: string`, `data?: object`，`html` 变为可选
- [x] 6.2 修改 `src/apps/host.ts` — `serveAppPage` 检测 app 的 mode，在 inject point 注入 MDX Runtime
- [x] 6.3 修改 `src/apps/host.ts` — `serveAppPage` 传递 mdx+data 或 html 给 sandbox

## 7. Harness 集成

- [x] 7.1 修改 `src/core/harness.ts` — `checkAndRegisterApp` 中：当 fetchUiResource 失败（无 HTML）时，fallback 到 auto-layout inference
- [x] 7.2 当 tool result 有 `structuredContent` 且无 HTML resource → 调用 `inferLayout()` → 注册 data mode app
- [x] 7.3 保持向后兼容：有 HTML resource 时走原有 srcdoc 路径不变

## 8. Example 更新

- [x] 8.1 修改 `examples/scenario-modeler/server.ts` — 删除 `s.resource()` 调用，删除 `mcp-app.html` 读取逻辑
- [x] 8.2 删除对 `examples/scenario-modeler/mcp-app.html` 的引用（文件保留作为参考）
- [x] 8.3 （可选）server.ts 中添加 `_ui.mdx` override 示例，展示自定义布局
- [x] 8.4 更新 `examples/scenario-modeler/README.md` — 说明无需手写 HTML

## 9. 构建与验证

- [x] 9.1 运行 `npm run typecheck` 确保零错误
- [x] 9.2 运行 `npm run build` 确保 MDX Runtime bundle 正确嵌入 sandbox.html
- [x] 9.3 验证 `npm run demo` 启动 → Agent 调用 get-scenario-data → TUI 显示 URL → 浏览器打开 → MDX Runtime 渲染图表
- [x] 9.4 验证向后兼容：现有 mcp-app.html（手动放置）仍能正常渲染
