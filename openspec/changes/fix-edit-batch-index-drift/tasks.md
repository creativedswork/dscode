## 1. 修复索引漂移

- [ ] 1.1 在 `src/drivers/edit/hash.ts` 的 `applyEditOperations()` 中，预解析后对单行操作按其锚点行号降序排序再应用，保证结果与输入顺序无关。
- [ ] 1.2 对混合单行 + range 操作的 batch，按「单行锚点行号 / range 较大端点行号」降序统一排序后应用。
- [ ] 1.3 确认 `detectAndResolveOverlaps` 的同 hash 合并在排序前执行，且合并后的单元作为整体参与排序（不被拆散/重排）。
- [ ] 1.4 保持 `insert_after`（`idx = lineNum`）与 `insert_before`（`idx = lineNum - 1`）的插入索引语义在降序下不变。

## 2. 回归测试

- [ ] 2.1 新增用例：相邻行 `insert_after` + `replace_line` 不产生重复/丢失/覆盖。
- [ ] 2.2 新增用例：同一组不同锚点的单行操作，任意输入顺序结果一致。
- [ ] 2.3 新增用例：`insert_before` + 上方 `replace_line` 互不干扰。
- [ ] 2.4 新增用例：`replace_range` + 下方 `insert_after` 均落在预期行。
- [ ] 2.5 新增用例：同 hash `replace_line` + `insert_after` 仍先合并后按降序参与应用。
- [ ] 2.6 `npm run typecheck` 与 `npm test`（或 edit-tool 相关测试）通过。

## 3. 模型引导更新

- [ ] 3.1 更新 `openspec/specs/model-edit-guidance/spec.md`：新增「safety-check 失败是权威信号」「多操作 batch 后复读校验」两条需求。
- [ ] 3.2 更新系统提示 "Edit Tool Best Practices" 渲染文案，加入上述两条，并明确「禁止未诊断即用 `warn`/`off` 覆盖 safety 失败」。
- [ ] 3.3 确认渲染处提及 `safety_check_failed` / `unbalanced_braces` / `duplicate_line` 等错误类型及对应预防动作。

## 4. 验证

- [ ] 4.1 用「相邻行 insert + replace」的真实原型场景手动验证：编辑后文件无重复行、无丢失行、括号平衡。
- [ ] 4.2 确认 `syntax_check`（`post-edit-validate`）对编辑结果仍在响应中给出（信息性、不阻断）。
