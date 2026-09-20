## Why

`edit` 工具在单个 batch 内包含多个单行操作（`insert_after` / `insert_before` / `delete_line` / `replace_line`）且锚点行不同时，会因**锚点行号索引漂移**而损坏文件。`applyEditOperations` 先把所有操作解析成编辑前原始行号，再顺序应用到已变形的 `result`，一旦前面的 insert/delete 改变了行号，后续 `replace_line` 就写到错误位置——表现为「复制而非替换」「目标行丢失」「整行错位」。本次会话在重建 HTML 原型时多次触发：`insert_after` + `replace_line` 相邻行导致 `header.innerHTML` 重复、`setAttribute` 丢失、事件绑定 `btnRun` 整行消失。

同时，`runSanityChecks`（P0-10 整文件分隔符平衡）**正确**检测到了这类损坏并拒绝（`unbalanced_braces: net +2`），但模型误判为误报并用 `safety_check: warn` 覆盖，使损坏落入磁盘且未在后续校验前被发现。这暴露了 `model-edit-guidance` 的引导缺口：没有明确「safety_check 失败是权威信号」与「多操作 batch 后必须复读校验」。

## What Changes

- **修复索引漂移（核心）**：`applyEditOperations` 对单行操作按锚点行号**降序（自底向上）**应用，使每个操作的锚点索引在其应用时刻始终有效，结果与操作输入顺序无关。
- **强化模型引导**：`model-edit-guidance` 新增两条——(1) `safety_check_failed` 是权威信号，禁止在未复读诊断前用 `warn`/`off` 覆盖；(2) 多操作 batch 应用后必须 `read_file(hashes:true)` 复读受影响区域校验。

## Capabilities

### Modified Capabilities

- `edit-tool`: 批量单行操作位置无关地应用，消除锚点行号索引漂移导致的文件损坏。
- `model-edit-guidance`: 系统提示新增 safety-check 权威性、多操作复读校验两条最佳实践。

## Impact

- **编辑核心**：`src/drivers/edit/hash.ts` 的 `applyEditOperations()`——单行操作按锚点行号降序应用；`insert_after`/`insert_before` 在降序排序下的插入索引语义需保持不变。
- **测试**：`edit-tool` 相关测试需覆盖「相邻行 insert + replace」「操作顺序无关性」等回归用例。
- **提示工程**：`model-edit-guidance` spec 与系统提示渲染处的 "Edit Tool Best Practices" 文案更新。
- **非目标**：不改 `post-edit-validate` 的 HTML 内联 `<script>` 校验范围、不改 `recovery.ts` 的三级恢复策略、不改 `edit-dry-run`。
