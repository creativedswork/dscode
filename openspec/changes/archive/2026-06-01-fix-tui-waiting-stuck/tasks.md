## 1. Fix: thinkingDelta activity tracking

- [x] 1.1 在 `src/ui/tui-app.ts` 的 `thinkingDelta()` 方法中添加 `this.markActivity()` 调用，确保思考 token 到达时重置等待计时器

## 2. Verification

- [x] 2.1 运行 `npm run typecheck` 确保类型检查通过
- [ ] 2.2 手动验证：发送复杂推理请求，确认 TUI "Waiting..." 计时器在 thinking 阶段被正确重置
