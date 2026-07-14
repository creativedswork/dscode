## Why

当前 web 前端的消息展示是"数据结构直接映射"而非"阅读体验设计"——assistant 消息是单一色块气泡，thinking/tool/text 全部塞在一个框里，没有信息层次也没有呼吸感。用户难以一眼区分思考过程、工具执行和最终回复。需要一次结构性的消息容器重构，用 Flat & Minimal 设计方向替代当前的 Bubbles 模型。

## What Changes

- **消息容器扁平化**：assistant 消息从单一 `.message-card` 气泡改为 `.assistant-msg` 纵向流式容器，内部分离 thinking、tool card、text response 三个独立区域
- **角色标识增强**：加入 `meta` 行（dscode · 09:41），thinking 区块用左侧细线 + hover 变色替代粗暴的 `<details>` 折叠
- **工具卡片重设计**：tool card 变为 6px 圆角扁平卡片，header 含状态图标 + 工具名 + 参数 + 折叠箭头，body 有 0.3s 展开过渡动画
- **MCP 工具差异化渲染**：MCP 工具卡片左侧 accent 色条 + MCP 徽章；富结果用 `.mcp-rich-list` 垂直列表（含标题/评分/URL/多段落摘要/元信息），原始输出用 `.mcp-raw-block` 等宽滚动区
- **间距节奏**：消息间距 36px，assistant 内部间距 16px，创造有节奏的阅读流
- **过渡动画兼容**：保持所有 `data-collider` 属性映射不变，`TransitionCanvas` 碰撞检测零影响

## Capabilities

### New Capabilities
- `flat-message-layout`: 扁平化消息布局系统，定义 assistant/user 消息的 DOM 结构、CSS 样式和 data-collider 映射规则

### Modified Capabilities
- `web-frontend`: 消息展示从 bubble 模型迁移到 flat 模型，涉及 ChatView、ToolCard、Markdown 组件的结构性变更
- `tool-result-content-rendering`: MCP 工具结果增加富列表（`.mcp-rich-list`）和原始输出（`.mcp-raw-block`）两种新渲染模式

## Impact

- **`web/src/components/ChatView.tsx`**: MessageBubble → 新的 flat 结构组件；元信息行、thinking 区块重构
- **`web/src/components/ToolCard.tsx`**: 视觉重设计 + MCP 变体（`.mcp` 类、badge、rich-list 渲染）
- **`web/src/components/Markdown.tsx`**: 不变（text-line/code-line 映射保持）
- **`web/src/index.css`**: 移除旧 bubble 样式，新增 flat layout、tool card、MCP 组件样式
- **`web/src/components/TransitionCanvas.tsx`**: 不变（data-collider 兼容已验证）
