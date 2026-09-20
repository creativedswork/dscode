## Context

`edit` 工具允许在一个调用里提交有序的多个操作（`operations[]`），工具描述声明「同一调用内的所有操作对同一初始快照原子应用，后续操作看不到前面操作的结果」。当前实现 `applyEditOperations`（`src/drivers/edit/hash.ts`）分两步：

1. 预解析：把所有操作 hash 解析为编辑前原始快照的行号。
2. 顺序应用：遍历操作，用第一步得到的**原始行号**对 `result`（初始为 `[...lines]`）做 `result[idx] = content` 或 `splice`。

问题在于第 2 步的 `result` 会随着插入/删除而改变长度，但索引仍取自原始行号。因此「锚点行号较小（靠上）的插入」会把「锚点行号较大（靠下）的替换目标」向后挤，导致替换写错位置。当 batch 内存在相邻行的 `insert_after` + `replace_line`（本次会话的典型形态）时，会稳定复现：插入行被覆盖、旧行残留成重复、目标行丢失。

`detectAndResolveOverlaps` 只处理**同一 hash** 上的操作合并（`replace_line`+`insert_after` 等），不处理**不同 hash 但相邻行**的索引漂移。`runSanityChecks` 的 P0-10 分隔符平衡是事后检测（正确识别了 `net +2`），但只能拦截分隔符失配，无法拦截不改变分隔符数量的错位（如纯文本重复、代码顺序颠倒）。

## Goals / Non-Goals

**Goals:**

- 批量单行操作的结果与 `operations[]` 的输入顺序无关。
- 相邻行的 `insert_after` + `replace_line` 不再产生重复/丢失/错位。
- 系统提示明确：safety-check 失败是权威信号，多操作 batch 后须复读校验。

**Non-Goals:**

- 不改 `replace_range`/`delete_range` 的语义（它们用双端点 + `splice` 区间替换，本身无此漂移问题，除非与单行操作混用——见 D3）。
- 不改 `recovery.ts` 的 snapshot-replay / content-search 三级恢复。
- 不改 `post-edit-validate` 对 HTML 内联 `<script>` 的校验范围（本次损坏发生在 `.html` 的内联脚本，HTML 标签平衡校验无法捕获；留待后续单独 change）。

## Decisions

### D1：单行操作按锚点行号降序（自底向上）应用

`applyEditOperations` 在预解析后，对 `isSingleLineOp` 的操作按其解析出的锚点行号**降序**排序后顺序应用。这样靠下的操作先落地，靠上的操作后落地；靠上操作的锚点索引不受靠下插入/删除影响，因为被改动的只有其下方行。结果天然位置无关。

- 备选：每次操作后重新解析剩余操作的锚点行号。→ 被否：需反复重解析、且与「原子快照」语义冲突、复杂度高。
- 备选：显式构造 line patch（记录每个原始区间→新内容）再一次性应用。→ 可行但改动面大；降序排序是等价且最小的修复。

### D2：`insert_after`/`insert_before` 在降序下保持「相对锚点行」语义

降序应用时，`insert_after` 的插入点仍是「该锚点行之后」（0-indexed `idx = lineNum`），`insert_before` 仍是「该锚点行之前」（`idx = lineNum - 1`）。由于该锚点行在降序应用时尚未被上方操作改动，其索引仍然有效，插入点语义不变。

### D3：混合单行操作与 range 操作时的顺序策略

当一个 batch 同时包含单行操作与 `replace_range`/`delete_range` 时，先按锚点/端点行号降序统一排序所有操作再应用。range 操作取其 `start_hash`/`end_hash` 中较大的端点行号参与排序，保证区间替换也不被下方操作漂移。

- 备选：禁止混合。→ 被否：过度限制，且现有用例存在混合批次的合法诉求。

### D4：模型引导——safety-check 失败是权威信号

`model-edit-guidance` 新增：当 `edit` 返回 `safety_check_failed`（如 `unbalanced_braces`、`unbalanced_parens`、`suspicious_extra_brace`、`duplicate_line`）时，模型**不得**在未复读文件并诊断原因前用 `safety_check: warn` 或 `safety_check: off` 重试。失败说明编辑**将/已**产生损坏，应复读受影响区域定位错位。

### D5：模型引导——多操作 batch 后复读校验

`model-edit-guidance` 新增：一个 `edit` 调用含 2 个及以上操作时，应用后应 `read_file(hashes:true)` 复读受影响区域，确认结果符合意图（无重复行、无目标行丢失、括号平衡），再继续后续操作，不依赖工具返回的 diff 摘要。

## Risks / Trade-offs

- [降序排序改变已有行为] → 仅影响「同一 batch 内多单行操作且锚点行不同」的场景；该场景当前是损坏的，修复是严格改进。同一 hash 的操作已由 `detectAndResolveOverlaps` 前置合并，排序不会破坏它。
- [insert 语义在降序下需回归验证] → 补回归用例覆盖 `insert_before`+`replace_line`、`insert_after`+`delete_line`、相邻行 `insert`+`replace`、纯降序输入、乱序输入。
- [safety-check 权威性可能带来误拒绝] → 若确为误报，模型应先 `dry_run` 或复读后显式诊断，再决定；但默认应信任，避免「warn 硬闯」再次发生。
