## 1. Remove duplicate blocks

- [x] 1.1 读取 `src/eval/dashboard.ts` 的 `generateDashboardHTML()` 函数，定位 lines 460–492（Block 2 + Block 3）
- [x] 1.2 删除 Block 2（lines 460–482）和 Block 3（lines 483–492），仅保留 Block 1（lines 412–459）

## 2. Verify

- [x] 2.1 运行 `npm run typecheck` 确认类型检查通过
- [x] 2.2 运行 `npm test` 确认测试通过
- [x] 2.3 手动运行 `/eval` 检查生成的 HTML 中 "Harness Rules" 区块仅出现一次
