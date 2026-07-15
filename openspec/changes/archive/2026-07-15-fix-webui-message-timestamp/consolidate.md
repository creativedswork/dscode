## 变更综述

从建立共享 UI 数据模型消除 TUI/Web 类型漂移，到为消息模型添加时间戳字段并消除硬编码时间显示——本次变更补全了 `UIMessage` 的时间维度，使 Web UI 的聊天消息能显示真实的发送时间。

## 变更时间线

- 2026-05-29: `shared-ui-data-model` — 引入 `src/ui/shared/` 共享数据模型层，定义规范的 `UIMessage` 类型和 `conversationReducer`，消除 TUI/Web 的类型漂移
- 2026-07-15: `fix-webui-message-timestamp` — 添加 `createdAt` 字段并替换硬编码时间字符串

## 初始设计

TUI 和 Web UI 各自维护独立的类型定义和状态构建逻辑，添加功能需要同时修改 6+ 文件，经常出现一端工作另一端损坏的情况。

`shared-ui-data-model` 通过以下方式解决了这个问题：
- 在 `src/ui/shared/` 中定义规范的 `UIMessage`、`ToolCallEntry`、`ContentBlock` 类型
- 提供纯函数 `conversationReducer(state, event) → state` 供两端共用
- Web UI 导入共享类型替代自己的拷贝
- TUI `ConversationView` 采用相同的 `UIMessage` 模型

## 最终状态

Web UI 的聊天消息元信息行固定显示 `"09:41"`，无论消息实际何时发送。时间字符串硬编码在 `ChatView.tsx` 中，且 `UIMessage` 类型缺少 timestamp 字段。

`fix-webui-message-timestamp` 做了以下修复：
- 为 `UIMessage` 接口添加可选的 `createdAt?: number` 字段
- 在 conversation reducer 创建用户消息和 assistant 消息时记录 `Date.now()` 作为 `createdAt`
- 在 `ready` 事件映射中尝试从历史消息提取 timestamp（不可用时优雅降级）
- 替换 `UserBubble` 和 `AssistantMessage` 中的硬编码 `"09:41"` 为 `toLocaleTimeString()` 格式化的真实值
- `createdAt` 缺失时（如旧历史消息），从元信息行中省略时间而非显示错误值
