# Edit Tool 失败治理 — 技术方案

> 基于 `docs/EDIT-TOOL-FAILURE-ANALYSIS.md` 的分析结论
> 目标：将 edit 成功率从 69.2% 提升至 ≥ 90%，消除系统性失败模式

---

## 一、方案总览

| 编号 | 方案项 | 层级 | 优先级 | 预期收益 | 实施成本 |
|------|--------|------|--------|----------|----------|
| S1 | 统一文件工具参数命名 | 系统 | P0 | 消除 100% read_file 参数错误 | 低 |
| S2 | write_file 后锚点提醒机制 | 系统 | P0 | 消除 anchor_stale 失败 | 低 |
| S3 | recommended_anchors 权重增强 | 系统 | P0 | 降低低质量 anchor 使用率 | 低 |
| T1 | replace_range 方向自动纠正 | 工具 | P1 | 消除 invalid_range_order | 低 |
| T2 | edit 跨版本尽力恢复 | 工具 | P1 | 减少 anchor_stale 失败 | 中 |
| T3 | safety_check 扩展 + 精确诊断 | 工具 | P1 | 提升错误定位效率 | 中 |
| T4 | overlapping_operations 语义提升 | 工具 | P1 | 减少不必要的拒绝 | 中 |
| M1 | 模型系统提示补充 | 模型 | P2 | 预防性降低失败率 | 低 |
| M2 | 全量重写成本提示 | 模型 | P2 | 减少不必要的全量重写 | 低 |

---

## 二、系统层方案（P0）

### S1 — 统一文件工具参数命名

#### 问题

| 工具 | 当前参数名 |
|------|-----------|
| `read_file` | `path` |
| `write_file` | `path` |
| `overwrite_file` | `path` |
| `edit` | `file_path` |

模型在 Anthropic-native 与 OpenAI-compatible API 间切换时，因命名不一致而混淆。edit 用 `file_path`、read_file 用 `path`，导致 3 次 read_file 调用因参数名 `file_path` 错误而被拒绝。

#### 方案

**全部统一为 `path`**，理由：
1. 工具集内 `write_file`/`overwrite_file`/`read_file` 已使用 `path`
2. 变更面最小（仅改 1 个工具的参数名）
3. 与文件系统直觉一致

#### 代码变更

**文件：`src/tools/edit.ts`**（示意路径，以实际项目结构为准）

```typescript
// 修改前
const EditParams = z.object({
  file_path: z.string(),
  operations: z.array(EditOperationSchema),
  expected_file_version: z.string().optional(),
});

// 修改后
const EditParams = z.object({
  path: z.string(),
  operations: z.array(EditOperationSchema),
  expected_file_version: z.string().optional(),
});
```

同时修改实现函数中所有 `params.file_path` → `params.path`。

#### 兼容性过渡

为保持向后兼容，在参数校验层添加 alias：

```typescript
const EditParams = z.object({
  path: z.string(),
  file_path: z.string().optional(),  // deprecated, will be removed in v2
  operations: z.array(EditOperationSchema),
  expected_file_version: z.string().optional(),
}).transform((v) => {
  if (v.file_path && !v.path) {
    console.warn('[deprecated] file_path is deprecated, use path instead');
    return { ...v, path: v.file_path };
  }
  return v;
});
```

过渡期设为 4 周，之后移除 `file_path` 别名。

#### 测试用例

```
1. edit({ path: "/foo", ... }) → 成功
2. edit({ file_path: "/foo", ... }) → 成功 + deprecation warning
3. edit({ path: "/foo", file_path: "/bar", ... }) → path 优先
4. edit({}) → 验证失败，提示缺少 path
```

---

### S2 — write_file/overwrite_file 后锚点提醒机制

#### 问题

模型在 `write_file`/`overwrite_file`（全量重写）后，没有重新 `read_file` 就直接用旧 hash 调用 edit，导致 `anchor_stale`。

根本原因：模型不知道全量重写会导致所有 anchor 失效。

#### 方案

在 `write_file` 和 `overwrite_file` 的返回结果中注入明确的锚点失效提醒，并通过 next-turn context 携带新文件的前 N 行 hash。

##### 2a. 返回结果增强

```typescript
// write_file 返回结构（新增字段）
interface WriteFileResult {
  ok: true;
  path: string;
  file_version: string;       // 已有
  lines_written: number;      // 已有
  // 新增字段 ↓
  anchors_invalidated: true;  // 标记：所有旧 anchor 已失效
  hint: "File rewritten. All previous hash anchors are invalid. Re-read with read_file({ hashes: true }) before calling edit.";
  preview_anchors?: Array<{   // 前 10 行的新 anchor
    line: number;
    hash: string;
    content_preview: string;  // 截断到 60 字符
  }>;
}
```

##### 2b. System Prompt 注入

在 write_file 发生后，下一轮请求的 system prompt 中追加 context：

```
[system] 注意：文件 /path/to/file 刚被全量重写为 N 行（fv: xxx）。
        所有来自该文件旧版本的 hash anchor 已失效。
        如需 edit，请先用 read_file({ path: "/path/to/file", hashes: true }) 获取新 anchor。
```

#### 实现要点

1. `write_file`/`overwrite_file` 执行后，将事件写入 session context store
2. 下一轮 tool call 前，检查 context store 中有无"anchor-invalidated"事件
3. 若有，将其作为额外 context 注入 system prompt
4. `preview_anchors` 选择前 10 行中 quality 为 `[high]` 的 anchor（避开 `}`、空行等低质量 anchor）

#### 测试用例

```
1. write_file → 检查返回结构含 anchors_invalidated + hint
2. write_file → 下一轮 system prompt 含 anchor 失效提醒
3. 非全量重写（仅 edit）→ 不触发锚点失效提醒
```

---

### S3 — recommended_anchors 权重增强

#### 问题

`read_file(hashes: true)` 返回的 `recommended_anchors` 列表已排除低质量 anchor（含 `[low]` 的重复 hash），但模型仍可能选择低质量 anchor。例如分析报告中的 `cbb184`（`}`，重复 100+ 次）。

#### 方案

**3a. 在返回结构中显式标记低质量 anchor 的风险**

```typescript
// read_file 返回的 anchor entry 扩展
interface LineAnchor {
  line: number;
  hash: string;
  content: string;
  quality: "high" | "med" | "low";
  // 新增 ↓
  occurrences: number;           // 该 hash 在文件中重复次数
  warning?: string;              // 若 quality === "low"，附加警告
}
```

示例：
```
17#cbb184 [low] occurrences=143 WARNING:ambiguous_anchor | }
```

**3b. 增加 recommended_anchors 的视觉权重**

在 read_file 返回末尾，将 `recommended_anchors` 放在更显眼的位置：

```
--- RECOMMENDED ANCHORS (use these for edit operations) ---
line   3   hash  fe3644  quality  [high]   0 repeats
line  12   hash  49e39a  quality  [high]   0 repeats
line  25   hash  2b3c4d  quality  [high]   0 repeats
...
--- END RECOMMENDED ANCHORS ---
```

**3c. System prompt 中增加锚点使用规范**

见 M1。

#### 测试用例

```
1. read_file 含 `}` 行 → quality=[low], occurrences≥2, warning 存在
2. recommended_anchors 列表中不含 quality=[low] 的 anchor
3. 重复 hash 的 occurrences 计数准确
```

---

## 三、工具层方案（P1）

### T1 — replace_range 方向自动纠正

#### 问题

当模型将 `replace_range` 的 `start_hash` 和 `end_hash` 顺序颠倒（start 对应行号 > end 对应行号），工具直接拒绝。

#### 方案

当检测到 `start_line > end_line` 时，自动交换两个端点并继续执行：

```typescript
function resolveRange(
  startHash: string,
  endHash: string,
  fileLines: AnchoredLine[]
): { startLine: number; endLine: number; corrected: boolean } {
  const startCandidates = findCandidates(startHash, fileLines);
  const endCandidates = findCandidates(endHash, fileLines);

  // ... 解析 startLine 和 endLine 的逻辑 ...

  let startLine = resolvedStart.line;
  let endLine = resolvedEnd.line;

  let corrected = false;
  if (startLine > endLine) {
    // 自动交换
    [startLine, endLine] = [endLine, startLine];
    corrected = true;
  }

  return { startLine, endLine, corrected };
}
```

在操作结果中标记纠正：

```json
{
  "ok": true,
  "operations_applied": 1,
  "auto_corrections": [
    {
      "type": "range_order_swapped",
      "detail": "start_line (791) was after end_line (17). Swapped automatically."
    }
  ]
}
```

#### 边界场景

- **两个 hash 解析结果相同**（同一行）：拒绝，提示这是 no-op。不应 swap。
- **两个 hash 中有一个解析失败**（ambiguous/not found）：不纠正，直接返回解析错误。

#### 测试用例

```
1. start=line800, end=line20 → auto-swap → 成功 + correction 标记
2. start=line20, end=line800  → 正常执行
3. start=line100, end=line100 → reject: no-op range
4. start hash 不存在 → reject: missing anchor（不触发 swap）
```

---

### T2 — edit 跨版本尽力恢复

#### 问题

模型携带 `expected_file_version` 但文件已被其他操作修改，工具直接拒绝。虽然这是安全机制，但在某些场景下可以更智能地处理。

#### 方案

实现三级恢复策略：

```
Level 1: expected_file_version 匹配 → 直接执行（当前行为）
Level 2: expected_file_version 不匹配，但所有操作 hash 在新文件中都找到 → 执行（hash 恰好未变）
Level 3: 部分 hash 找不到 → 返回精确的诊断信息
```

##### Level 2 实现逻辑

```typescript
function tryCrossVersionEdit(
  operations: EditOperation[],
  snapshot: Snapshot,
  currentFile: AnchoredLine[]
): EditResult | null {
  // 提取所有涉及的 hash
  const allHashes = extractAllHashes(operations);

  // 在当前文件中检查每个 hash 是否存在
  const missing = allHashes.filter(h => !hashExistsInFile(h, currentFile));
  const ambiguous = allHashes.filter(h => countOccurrences(h, currentFile) > 1);

  if (missing.length > 0) {
    // 进入 Level 3：返回缺失详情
    return {
      ok: false,
      error: "cross_version_conflict",
      missing_hashes: missing,
      hint: "Some anchors no longer exist. Re-read the file.",
      suggestion: suggestNearbyLines(missing, currentFile),
    };
  }

  // 执行操作（不做版本校验）
  const result = applyOperations(operations, currentFile);

  return {
    ...result,
    warning: "cross_version: file was modified since snapshot, but anchors were still valid",
  };
}
```

##### Level 3 诊断增强

当 hash 找不到时，提供**最近邻匹配**：

```typescript
function suggestNearbyLines(
  missingHashes: string[],
  currentFile: AnchoredLine[]
): Array<{ missing_hash: string; nearby_candidates: Array<{ line: number; hash: string; preview: string }> }> {
  // 在快照中找原来该 hash 对应的行号
  // 在当前文件中找该行号附近的 3 行作为候选
  // 返回结构化的建议
}
```

#### 安全边界

- Level 2 仅当 **所有 hash 全部存在且唯一** 时才执行
- 不执行部分匹配（部分 hash 存在、部分不存在 → 全部拒绝）
- Level 2 的结果中必须标记 `warning: "cross_version"` 以告知模型

#### 测试用例

```
1. fv 匹配 → Level 1 → 正常执行
2. fv 不匹配，所有 hash 在新文件中存在 → Level 2 → 执行 + warning
3. fv 不匹配，1 个 hash 不存在 → Level 3 → 返回 missing_hashes + suggestions
4. fv 不匹配，hash 存在但 ambiguous → reject + 提示指定 occurrence
```

---

### T3 — safety_check 扩展 + 精确诊断

#### 问题

当前 `safety_check_failed` 只报告 `net +N` 括号不平衡，不指出具体哪一行。模型需要额外往返才能定位问题。

#### 方案

##### 3a. 扩展检查项

```typescript
interface SafetyCheckResult {
  passed: boolean;
  checks: {
    braces: BraceCheckResult;        // {} 平衡
    parentheses: ParenCheckResult;   // () 平衡
    brackets: BracketCheckResult;    // [] 平衡
    html_tags?: HtmlTagCheckResult;  // HTML 标签完整性
  };
}

interface BraceCheckResult {
  balanced: boolean;
  net_delta: number;                 // +2 表示多了两个 {
  // 新增 ↓
  per_operation: Array<{
    op_index: number;
    hash: string;
    line: number;
    delta: number;
    detail: string;                  // 如 "line 45: +2 { -1 }"
  }>;
}
```

##### 3b. 错误消息增强

当前输出：
```
Edit rejected: safety check failed. File rolled back.
Warnings: unbalanced_braces: net +2
```

建议输出：
```
Edit rejected: safety check failed. File rolled back.
┌─ Brace Balance ─────────────────────────────────────────┐
│ Operation 0 (hash: a50fa8, line 221):                    │
│   Before: {5 }5  →  After: {5 }4    NET: +1 {          │
│ Operation 1 (hash: 9128df, line 228):                    │
│   Before: {3 }3  →  After: {4 }3    NET: +1 {          │
│                                                          │
│ Total: net +2 unclosed braces                            │
│                                                          │
│ Hint: check lines 221 and 228 for missing closing }     │
└──────────────────────────────────────────────────────────┘
```

##### 3c. 可选：非阻塞模式

增加一个参数 `safety_check: "strict" | "warn" | "off"`：

```typescript
const EditParams = z.object({
  // ...existing fields...
  safety_check: z.enum(["strict", "warn", "off"]).default("strict"),
});
```

- `strict`（默认）：当前行为，失败则回滚
- `warn`：执行但返回 warning（用于模型自行验证后的编辑）
- `off`：跳过安全检查（仅限 trusted 场景）

慎用 `warn`/`off`，仅在系统提示中说明可用场景。

#### 测试用例

```
1. 单行替换：+1 不平衡 → 拒绝 + 详细 per-op 报告
2. 多行替换：恰好平衡 → 通过
3. HTML 文件：标签不闭合 → 拒绝 + 指出标签名
4. safety_check: "warn" → 执行但带 warning
```

---

### T4 — overlapping_operations 语义提升

#### 问题

当同一个 hash 在同一批次中被 `replace_line` 和 `insert_after` 同时引用时，工具无法确定执行语义，直接拒绝。

#### 方案

**自动检测并合并重叠操作**：

```typescript
function detectAndResolveOverlaps(operations: EditOperation[]): {
  resolved: EditOperation[];
  warnings: string[];
} {
  const hashToOps = new Map<string, EditOperation[]>();

  for (const op of operations) {
    const hash = extractHash(op);
    if (!hashToOps.has(hash)) hashToOps.set(hash, []);
    hashToOps.get(hash)!.push(op);
  }

  const warnings: string[] = [];

  for (const [hash, ops] of hashToOps) {
    if (ops.length <= 1) continue;

    // 检测 replace_line + insert_after 组合
    const replaceOp = ops.find(o => o.op === "replace_line");
    const insertAfterOp = ops.find(o => o.op === "insert_after");

    if (replaceOp && insertAfterOp) {
      // 合并：将 replace 和 insert 合成一个新的 replace_line
      // 新内容 = 替换后内容 + 插入内容
      const mergedContent = replaceOp.content + "\n" + insertAfterOp.content;
      replaceOp.content = mergedContent;
      // 移除 insertAfterOp
      ops.splice(ops.indexOf(insertAfterOp), 1);
      warnings.push(
        `Auto-merged replace_line + insert_after on hash ${hash} into single replace_line`
      );
      continue;
    }

    // 其他重叠模式 → 仍然拒绝但提供更清晰的提示
    return {
      resolved: [],
      warnings: [],
      error: `Unresolvable overlap on hash ${hash}: ${ops.map(o => o.op).join(", ")}`,
    };
  }

  return { resolved: operations, warnings };
}
```

#### 可安全合并的组合

| 组合 | 处理方式 |
|------|---------|
| `replace_line` + `insert_after` (同 hash) | 合并为 replace_line(new_content + "\n" + insert) |
| `insert_before` + `replace_line` (同 hash) | 合并为 replace_line(insert + "\n" + new_content) |
| `replace_line` + `insert_before` (同 hash) | 合并为 replace_line(insert + "\n" + new_content) |

#### 不可合并的组合

| 组合 | 原因 |
|------|------|
| `replace_line` + `delete_line` (同 hash) | 语义矛盾 |
| `insert_after` + `insert_before` (同 hash) | 顺序歧义 |

#### 测试用例

```
1. replace + insert_after (同 hash) → 自动合并
2. insert_before + replace (同 hash) → 自动合并
3. replace + delete (同 hash) → 拒绝 + "semantic conflict" 提示
4. insert_after + insert_before (同 hash) → 拒绝 + "order ambiguous" 提示
```

---

## 四、模型层方案（P2）

### M1 — 模型 system prompt 补充

#### 新增内容

在 tool use system prompt 中追加以下 instructions：

```markdown
## Edit Tool Best Practices

### Anchor Selection
- ALWAYS prefer hashes from the `recommended_anchors` list returned by `read_file`.
- NEVER use hashes marked as `[low]` quality for `replace_range` endpoints.
- When a hash appears multiple times (check quality/occurrences), you MUST specify the `occurrence` parameter to disambiguate.
- Before constructing an edit with an ambiguous hash, re-read the file and use the line number to identify the correct occurrence.

### After Full File Rewrites
- After calling `write_file` or `overwrite_file`, ALL previous hash anchors from that file are invalidated.
- You MUST call `read_file({ path, hashes: true })` to obtain new anchors before any subsequent `edit` call on that file.
- Do NOT reuse hash values from a previous `read_file` snapshot after a write_file.

### Range Operations
- When using `replace_range`, ensure start_hash corresponds to an earlier line than end_hash.
- If the range is small (1-5 lines), prefer multiple `replace_line` operations over a single `replace_range`.
- Do NOT use `replace_range` with `[low]` quality hashes as endpoints.

### Safety Checks
- The edit tool performs brace/parenthesis/bracket balance checks.
- If rejected with `safety_check_failed`, check the per-operation delta report to identify which lines caused the imbalance.
- For highly compressed single-line code, double-check your brace counting before submitting.

### Overlapping Operations
- A single batch CANNOT contain both a `replace_line` and `insert_after` referencing the same hash.
- Split them into two sequential edit calls: first replace, then insert.
```

---

### M2 — 全量重写成本提示

#### 方案

在模型选择工具时，通过 context 注入成本提示：

```markdown
## File Modification Strategy

When modifying existing files, prefer incremental `edit` operations over full `write_file` rewrites:

- For changes ≤ 50 lines: use `edit` with `replace_line` operations
- For changes 50-200 lines: use `edit` with `replace_range` for large blocks
- For changes > 200 lines or structural rewrites: `write_file` is acceptable

Full rewrites invalidate ALL hash anchors, requiring an extra `read_file` round-trip (~2s latency, ~500-2000 tokens). In the analyzed session, 3 unnecessary full rewrites caused 8 extra round-trips, wasting ~15% of tokens and ~20% of wall-clock time.

Current file state: {file_size} lines. Last modification: {last_modified}.
```

#### 触发条件

- 文件存在且 > 30 行
- 模型选择了 `write_file`（而非 `edit`）
- 变更量可通过 diff 估算

此时注入一个 soft reminder："此文件有 N 行。如果变更不到 50 行，考虑使用 edit 而非 write_file。"

---

## 五、实施路线图

### Phase 1 — 快速止血（Week 1-2）

| 任务 | 方案 | 预计工时 |
|------|------|---------|
| 统一 `file_path` → `path`（含过渡期 alias） | S1 | 0.5d |
| write_file 返回结果增强（anchors_invalidated + hint） | S2a | 0.5d |
| replace_range 方向自动纠正 | T1 | 0.5d |
| 模型 system prompt 补充 | M1 | 0.25d |

**Phase 1 预期收益**：消除 3/4 的 edit 失败模式 + 全部 read_file 参数错误。成功率预估：69% → 85%。

### Phase 2 — 深度巩固（Week 3-4）

| 任务 | 方案 | 预计工时 |
|------|------|---------|
| write_file 后 system prompt 注入 | S2b | 1d |
| recommended_anchors 展示增强 | S3 | 0.5d |
| safety_check 扩展 + 精确诊断 | T3 | 1.5d |
| overlapping 自动合并 | T4 | 1d |

**Phase 2 预期收益**：提升错误恢复效率。成功率预估：85% → 92%。

### Phase 3 — 智能优化（Week 5-6）

| 任务 | 方案 | 预计工时 |
|------|------|---------|
| edit 跨版本尽力恢复（Level 2 + Level 3） | T2 | 2d |
| 全量重写成本提示 | M2 | 0.5d |
| 回归测试 + 监控 | — | 1d |

**Phase 3 预期收益**：精细化处理边界场景。成功率预估：92% → 96%。

---

## 六、成功指标

| 指标 | 基线 | Phase 1 目标 | Phase 2 目标 | Phase 3 目标 |
|------|------|-------------|-------------|-------------|
| Edit 成功率 | 69.2% | ≥ 85% | ≥ 92% | ≥ 96% |
| `invalid_range_order` 发生率 | 8.3% | 0% | 0% | 0% |
| `anchor_stale` 发生率 | 8.3% | ≤ 3% | ≤ 1% | ≤ 0.5% |
| `safety_check_failed` 恢复往返次数 | 2-3 轮 | 1-2 轮 | 1 轮 | 1 轮 |
| read_file 参数错误 | 3 次/会话 | 0 | 0 | 0 |
| 失败后平均恢复往返 | 2.0 轮 | 1.2 轮 | 1.0 轮 | 1.0 轮 |

---

## 七、风险与回滚

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| `file_path` → `path` 迁移破坏现有集成 | 低 | 中 | 保留 alias 4 周过渡期 + telemetry 监控 |
| auto-swap 纠正了模型故意颠倒的语义 | 极低 | 低 | 标记纠正 warning，模型可检测 |
| 跨版本恢复导致数据损坏 | 低 | 高 | Level 2 仅当所有 hash 存在且唯一时启用 |
| safety_check `warn` 模式被滥用 | 中 | 中 | 默认 strict，system prompt 限制 warn 场景 |

---

## 八、附录

### A. 涉及文件清单

| 文件 | 变更内容 |
|------|---------|
| `src/tools/edit.ts` | S1 参数重命名、T1 方向纠正、T2 跨版本恢复、T3 安全检查扩展、T4 重叠合并 |
| `src/tools/write_file.ts` | S2a 返回结构增强 |
| `src/tools/read_file.ts` | S3 anchor 信息扩展 |
| `src/context/session.ts` | S2b session context store |
| `src/prompt/system.ts` | M1 edit best practices、M2 成本提示 |
| `src/types/anchor.ts` | 新增 LineAnchor、SafetyCheckResult 等类型 |

### B. 参考

- `docs/EDIT-TOOL-FAILURE-ANALYSIS.md` — 原始失败分析报告
- `docs/STYLE.md` — dscode 编码规范
