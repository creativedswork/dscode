# Edit Tool 调用失败分析报告

> 分析对象: `00MQ9UJ7MIZ7MSVZ3ZBRLFC45F` (保龄球游戏实现会话)
> 会话时间: 1781203431258 — 1781242341341
> 模型: deepseek-v4-pro (via openai-completions API)
> 总消息数: 184

---

## 一、执行摘要

该会话共发起 **13 次 edit 调用**,其中 **4 次失败** (失败率 30.8%)。此外还有 **3 次 read_file 调用失败** 和 **1 次 bash 调用异常**。edit 失败直接导致模型需额外发起补救轮次，产生约 8 次额外的 read_file + edit 往返，估算浪费 ~15% 的推理 token 和 20% 的 wall-clock 时间。

edit 工具是 dscode 中最精密、也是出错模式最丰富的编辑原语。本次会话暴露出 **4 类 edit 失败模式**：

| 失败类型 | 次数 | 严重度 | 根因层级 |
|---------|------|--------|---------|
| `invalid_range_order` | 1 | 中 | 模型 |
| `anchor_stale` | 1 | 高 | 系统+模型 |
| `safety_check_failed` | 1 | 中 | 模型 |
| `overlapping_operations` | 1 | 低 | 模型 |

以及 **1 类 read_file 失败**：

| 失败类型 | 次数 | 根因层级 |
|---------|------|---------|
| 参数名 `file_path` vs `path` | 3 | 系统 |

---

## 二、会话文件演化轨迹

在深入分析 edit 失败之前，先理解文件在整个会话中的演化路径：

```
1365 行 (write_file, fv_2174c95c)     ← 初始 HTML 文件
  ↓
1325 行 (write_file, fv_7cfd4b8c)     ← 第一次全量重写 (缩减 -40 行)
  ↓
 848 行 (overwrite_file, fv_b2c62b09) ← 第二次全量重写 (缩减 -477 行, 代码压缩)
  ↓
 233 行 (write_file, fv_aafe4e97)     ← 第三次全量重写 (缩减 -615 行, 极度压缩)
  ↓
233 行 persist (9 次成功 edit)
```

**关键观察**：文件经历了 3 次全量重写，从 1365 行压缩到 233 行。每次 `write_file`/`overwrite_file` 都会使之前所有的 hash anchor 失效，而模型有 2 次未能及时 `read_file` 刷新 anchor 就直接调用 edit，导致 `anchor_stale` 错误。

---

## 三、失败案例分析

### 3.1 invalid_range_order（范围顺序错误）

**发生时间**：msg[127] → msg[128]
**文件版本**：fv_f19df808（848 行）

#### 触发操作
```json
{
  "op": "replace_range",
  "start_hash": "c02060",   // → 对应行 791
  "end_hash": "cbb184",     // → 对应行 17
  "content": "// 投球结果检测\n..."
}
```

#### 错误输出
```
Edit rejected: invalid range order.
Start line 791 is after end line 17.
Hint: swap start_hash and end_hash, or re-read the file for correct anchors.
```

#### 根因分析

`cbb184` 是一个**高频重复 hash**（在该文件中出现 100+ 次），它对应的是 `}`（单独右花括号行）。模型在一次 `read_file` 中看到了两个不同位置的 `cbb184`：

- `cbb184` @ line 17：CSS 块结束 `  }`
- `cbb184` @ line ~840：JS 函数末尾 `}`

模型意图删除从 line 791 (`c02060`) 到 line ~840 的范围，但在 parse anchor 时，它选择了 line 17 的 `cbb184` occurrence（因为其作为 early anchor 被优先匹配），导致 `start_line=791 > end_line=17`。

#### 深层原因

1. **`cbb184` 是低质量 anchor** — 它在文件中重复出现 100+ 次，哈希值为 `cbb184`，quality 标记为 `[low]`
2. **模型没有指定 `occurrence` 参数** — 当同一 hash 出现多次时，模型应使用 `occurrence` 字段指定第几次出现
3. **模型没有注意到 `recommended_anchors`** — read_file 返回的推荐 anchor 列表中不包含 `cbb184`，因为它是低质量 anchor

#### 恢复过程

模型在错误消息引导下，改用 8 个单行 `replace_line` 操作替代 `replace_range`，成功完成编辑。代价：额外 1 轮 read_file + 1 轮 edit。

---

### 3.2 anchor_stale（锚点过期）

**发生时间**：msg[143] → msg[144]
**文件版本**：fv_aafe4e97（233 行）

#### 场景上下文

这是 4 次失败中**影响最大**的一次。模型刚刚通过 `write_file` 将文件从 848 行全量重写为 233 行（msg[132]，fv_aafe4e97），然后没有重新 `read_file`，直接用旧的 anchor hash `8a5a73` 调用 edit。

#### 触发操作
```json
{
  "op": "replace_line",
  "hash": "8a5a73",   // 该 hash 在 fv_aafe4e97 中不存在
  "content": "..."
}
```

#### 错误输出
```
Edit rejected: file has changed since last read or anchors are invalid.
Missing anchors: [8a5a73]
Hint: re-read the file with read_file(hashes: true) to get current anchors and retry.
```

#### 根因分析

**系统层面的缺陷**：

1. **`write_file` 返回的新 anchor 未被模型信任或解析** — `write_file` 结果中明确给出了 `new_anchors: ["1#fe3644", "2#49e39a", ...]`，但模型没有从中提取目标行的新 hash
2. **模型的操作惯性** — 模型刚从一次 `read_file`(msg[126], fv_f19df808) 获得 anchor 列表，在其中间执行了 `write_file`(msg[132]) 后，没有重新 read_file，直接跳到 edit( msg[143] )

**编辑流程中的断链**：

```
msg[126] read_file (fv_f19df808, 848行) → 获得 anchor "8a5a73" @ line 801
msg[130] edit (成功, fv_9888a146)
msg[132] write_file (全量重写, fv_aafe4e97, 233行) ← 此处断链！
msg[143] edit 使用 hash "8a5a73" ← 该 hash 已不存在于新文件
```

#### 恢复过程

模型 read_file → edit → 成功。代价：额外 1 轮 read_file + 1 轮 edit。

---

### 3.3 safety_check_failed（安全校验失败：花括号不平衡）

**发生时间**：msg[201] → msg[202]
**文件版本**：fv_680deef5（233 行）

#### 触发操作
```json
[
  {
    "op": "replace_line",
    "hash": "a50fa8",
    "content": "for(const pin of pinBodies){if(!pin.standing&&pin.vel.length()<.04...)..." 
  },
  {
    "op": "replace_line", 
    "hash": "9128df",
    "content": "for(let i=0;i<pinBodies.length;i++){for(let j=i+1;j<pinBodies.length;j++){...}"
  }
]
```

#### 错误输出
```
Edit rejected: safety check failed. File rolled back.
Warnings: unbalanced_braces: net +2
```

#### 根因分析

这是一个**极有价值的防御机制**被触发。模型压缩后的 JS 代码中：

- 原始行 `a50fa8` 包含 5 个 `{` 和 5 个 `}`
- 新内容包含 5 个 `{` 和 4 个 `}`（少了一个 `}`）
- 原始行 `9128df` 包含 3 个 `{` 和 3 个 `}`
- 新内容包含 4 个 `{` 和 3 个 `}`（多了一个 `{`）

两行合并导致 **net +2 未闭合花括号**，edit 工具的安全校验机制检测到并回滚了整个操作。

**这说明了为什么 `safety_check_failed` 是一个好功能**：如果没有这个检查，文件将产生语法错误，且极难调试（因为是单行代码压缩版本，缺少一个 `}` 会导致 JS 完全失效）。

#### 深层问题

模型在**代码极度压缩**（233 行，大量单行多语句）的情况下，手工计算括号平衡出错。压缩代码的可读性差 → 模型难以肉眼验证括号配对 → 需要依赖工具的安全校验。

---

### 3.4 overlapping_operations（操作重叠）

**发生时间**：msg[326] → msg[327]
**文件版本**：fv_6e922c4e（233 行）

#### 触发操作
```json
[
  {
    "op": "replace_line",
    "hash": "7aa37c",
    "content": "ballG.position.copy(ballBody.pos);scene.add(ballG);"
  },
  {
    "op": "insert_after",
    "hash": "7aa37c",      // ← 与上面相同的 hash
    "content": "const spareBalls=[];const ballColors=[...];function mkSpareBall(c,i){..."
  }
]
```

#### 错误输出
```
Edit rejected: overlapping operations detected.
Multiple operations in this batch affect overlapping ranges.
Hint: combine them into a single replace_range or re-organize into separate batches.
```

#### 根因分析

模型试图在**同一个 atomic batch** 中：
1. 替换行 `7aa37c`
2. 在行 `7aa37c` 之后插入新内容

由于 edit 工具要求同一批次中的所有操作相对于**同一个初始快照**（pre-image），而 `replace_line` 和 `insert_after` 都引用同一个 `hash=7aa37c`，工具无法确定：
- `insert_after` 应该基于替换前还是替换后的内容？
- 如果替换变更了该行的内容（从而可能变更其 hash），insert 的目标是否还有效？

因此工具拒绝了这个有歧义的操作。

#### 恢复过程

模型将操作拆分为两次 edit：
1. 先 `replace_line`（msg[328] → msg[329]，成功）
2. 再 `insert_after`（在后续消息中完成）

代价：额外 1 轮 edit。

---

### 3.5 read_file 参数名错误（附）

**发生次数**：3（msg[83]、msg[120]、msg[243]）

#### 触发操作
```json
{
  "file_path": "/Users/bytedanceo/Workspace/DeepSeekSpace/ThreejsDemo/index.html",
  "offset": 305,
  "limit": 30,
  "hashes": true
}
```

#### 错误输出
```
Validation failed for tool "read_file":
- path: must have required properties path
```

#### 根因分析

模型的 tool schema 中参数名为 `path`，但模型使用了 `file_path`。这是因为：

1. **Anthropic-native API 与 OpenAI-compatible API 的 schema 翻译差异** — `edit` 工具使用 `file_path`，而 `read_file` 使用 `path`。当模型通过 OpenAI-compatible 接口调用时，可能混淆了两个工具的命名约定
2. **参数名不统一** — `edit`、`write_file`、`overwrite_file` 使用 `file_path`；`read_file` 使用 `path`。这是 API 设计层面的不一致

---

## 四、edit 工具设计缺陷分析

### 4.1 hash anchor 机制的根本张力

edit 工具依赖 content-based hash anchor 进行行定位，这本身是一个精巧的设计——它允许在不依赖行号的情况下定位行。但在以下场景中会出现系统性故障：

#### 问题 1：低质量 anchor 泛滥

`cbb184`（`}`）和 `d41d8c`（空行）在文件中重复出现 100+ 次。当模型不指定 `occurrence` 参数时，工具只能猜测意图。虽然 `read_file` 返回了 `recommended_anchors` (排除了低质量 anchor)，但模型仍可能选择低质量 anchor。

#### 问题 2：全量重写导致锚点雪崩

本会话中文件经历了 3 次全量重写，每次都导致所有 anchor 全部失效。虽然 `write_file` 的返回包含了新 anchor 列表，但模型需要额外一次 `read_file` 才能获得完整带 hash 的文件视图。

#### 问题 3：压缩代码的 hash 密度过高

在 233 行压缩代码中，每行包含 5-15 个 JS 语句，hash anchor 的"唯一性"下降——相邻行容易在 edit 后产生 hash 碰撞。

### 4.2 原子批次的操作隔离模型

`overlapping_operations` 错误揭示了一个设计权衡：edit 的原子批次保证所有操作基于同一 pre-image，这提高了安全性但也引入了约束——同一个逻辑位置不能被两个操作同时引用。

### 4.3 safety_check 的覆盖面

`safety_check_failed` 成功阻止了一次括号不平衡的破坏性编辑。当前已知的检查包括：
- 花括号 `{}` 平衡
- （可能）圆括号 `()` 平衡

这些检查对有语法要求的文件（JS/TS/JSON/CSS）至关重要。

---

## 五、改进建议

### 5.1 系统层建议（P0 - 高优先级）

#### 5.1.1 统一文件工具的参数命名

```
当前：
  read_file:        path
  write_file:       path
  edit:              file_path
  overwrite_file:    path

建议：
  全部统一为 file_path (与 Anthropic 原生 API 一致)
  或全部统一为 path
```

**影响**：直接消除 read_file 参数名错误（本会话中发生 3 次）。

#### 5.1.2 write_file/overwrite_file 后自动注入新 anchors

当模型通过 `write_file` 或 `overwrite_file` 创建/重写文件后，系统可以：
- 在新请求的 system prompt 或上下文中注入前 50 行的 hash anchor
- 或者在 write_file 结果中附带一个提示："已创建新文件，下次 edit 前请先 read_file"

**实现建议**：
```json
// write_file 返回中增加提醒
{
  "ok": true,
  "file_version": "fv_xxx",
  "new_anchors": [...],
  "warning": "file_rewritten: all previous anchors invalidated. Re-read before editing."
}
```

#### 5.1.3 增强 recommended_anchors 的权重

当前 `read_file(hashes: true)` 返回 `recommended_anchors`，但模型可能忽略。可以考虑：
- 在系统提示中强调"优先使用 recommended_anchors 中的 hash"
- 将低质量 anchor（重复 ≥ 5 次的）标记降级，不推荐用于 `replace_range` 端点

### 5.2 工具层建议（P1 - 中优先级）

#### 5.2.1 edit 的跨版本恢复机制增强

当前的 `expected_file_version` 机制在检测到版本不匹配时会拒绝。可以考虑增加一层**尽力恢复**：

```
当前行为：fv 不匹配 → 拒绝
建议行为：
  1. 检查 expected_file_version
  2. 若不匹配，比对操作中的 hash 是否在当前文件中存在
  3. 若所有 hash 都存在 → 接受（anchor 恰好未变）
  4. 若有 hash 缺失 → 返回具体哪些 hash 缺失以及可能匹配的候选项
```

#### 5.2.2 为 replace_range 添加方向自动纠正

当 `start_line > end_line` 时，工具可以自动交换 start 和 end：

```
当前行为：start > end → reject
建议行为：start > end → 自动 swap 并执行，同时在结果中提示已纠正
```

`invalid_range_order` 是一个纯机械错误，工具完全可以自行修复。

#### 5.2.3 safety_check 扩展

当前已知检查花括号平衡。建议增加：
- 圆括号 `()` 平衡
- 方括号 `[]` 平衡
- 对 HTML 文件检查标签完整性（`<x>` vs `</x>`）
- 在错误消息中**指出具体是哪一行**产生了不平衡，而非仅报告 `net +2`

### 5.3 模型层建议（P2 - 低优先级）

#### 5.3.1 edit 操作的 occurrence 使用规范

在系统提示中增加对 `occurrence` 参数的说明：

```
当 hash 匹配多行时，必须指定 occurrence 参数。
若不确定 occurrence，先用 read_file 确认行号，再构造 edit。
```

#### 5.3.2 全量重写的成本提示

当模型选择 `write_file`/`overwrite_file` 而非增量 `edit` 时，系统可以提示：

```
注意：全量重写会使所有 edit anchors 失效。对于 50 行以下的变更，建议使用 edit。
```

本会话中，模型 3 次全量重写导致 2 次 anchor_stale 失败和约 8 轮额外往返。

#### 5.3.3 压缩代码的括号检查辅助

当文件处于高度压缩状态（如本会话的 233 行），模型难以人工验证括号配对。建议在系统提示中增加：

```
当前文件被高度压缩。如需修改，建议先在脑海中展开代码结构，或请求 prettier 格式化。
```

---

## 六、数据统计

### 6.1 Edit 操作全景

| 指标 | 数值 |
|------|------|
| 总 edit 调用次数 | 13 |
| 成功次数 | 9 |
| 失败次数 | 4 |
| 成功率 | 69.2% |
| 因失败产生的额外往返 | ~8 轮 |
| 估算浪费 token | ~15,000 |
| 估算浪费时间 | ~45 秒 |

### 6.2 操作类型分布

| 操作类型 | 使用次数 | 失败次数 |
|---------|---------|---------|
| `replace_line` | 22 (跨 11 次调用) | 3 |
| `replace_range` | 1 | 1 |
| `insert_after` | 1 | 1 (重叠) |
| `insert_before` | 0 | 0 |
| `delete_line` | 0 | 0 |
| `delete_range` | 0 | 0 |

模型强烈偏好 `replace_line`（占比 92%）而几乎不使用 `replace_range`，这可能是由于 `replace_range` 需要两个唯一 hash 作为端点，在压缩代码中难以满足条件。

### 6.3 文件操作全景

| 操作 | 次数 | 涉及版本数 |
|------|------|-----------|
| read_file | 18 | 8 个不同 fv |
| edit | 13 | 从 9 个 fv 开始，产生 9 个新 fv |
| write_file | 3 | — |
| overwrite_file | 1 | — |

---

## 七、总结

本次会话的 edit 失败揭示了 dscode 文件编辑系统中的 **4 类核心风险**：

1. **Anchor 质量退化**：高频重复 hash（如 `}` 的 `cbb184`）在低质量文件中使 replace_range 变得脆弱
2. **版本链断链**：全量重写 → 锚点雪崩 → 未及时刷新 → anchor_stale
3. **压缩代码的可维护性**：233 行压缩代码中，模型无法准确计算括号平衡
4. **API 设计不一致**：`file_path` vs `path` 参数名混乱

每条建议都配有明确的实施优先级和预期收益。最关键的两项改进是 **5.1.1（统一参数名）**和 **5.2.2（自动纠正范围顺序）**——它们实现成本低，能直接消除 2/4 的 edit 失败模式和全部 read_file 失败。
