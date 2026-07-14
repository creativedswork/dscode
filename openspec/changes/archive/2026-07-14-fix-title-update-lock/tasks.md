## 1. 修改 isTitleBetter

- [x] 1.1 将 `isTitleBetter` 的替换逻辑从长度守卫改为前缀截断守卫：`candidate.length < current.length && current.startsWith(candidate)` 时保留 current，否则更新
- [x] 1.2 运行 `npm run typecheck` 确认编译通过

## 2. 测试

- [x] 2.1 更新现有 title extraction 测试，覆盖 topic shift 场景（title 从 command argument 更新为 human message）
- [x] 2.2 添加前缀截断场景测试（candidate 是 current 的截断版本时 title 不更新）
- [x] 2.3 添加不同内容但更短的 candidate 场景测试（title 应该更新）
- [x] 2.4 运行 `npm test` 确认全部通过
