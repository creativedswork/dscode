## Why

TUI 在模型推理过程中频繁出现 "Waiting..." 假死现象，加载器显示等待时间持续增长直到模型产生第一个 `text_delta`，用户误以为系统卡死。根因是 `thinkingDelta` 事件没有重置活动计时器，而 Web UI 不受影响（使用总用时计时）。

## What Changes

- **修复**: `TuiApp.thinkingDelta()` 添加 `this.markActivity()` 调用，确保模型产生 thinking token 时重置等待计时器，与 `textDelta`、`toolStart`、`toolEnd` 行为一致

## Capabilities

### New Capabilities

<!-- 无新增 capability — 纯 bug 修复 -->

### Modified Capabilities

<!-- 无 spec 改动 — 实现细节修复，不改变 contract -->

## Impact

- **受影响文件**: `src/ui/tui-app.ts`（仅 `thinkingDelta` 方法，+1 行）
- **不受影响**: Web UI、harness、agent 事件系统
- **无破坏性变更**: 不改变 API、协议或接口
