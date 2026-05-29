## Context

当前 hashline 协议 (anchor_format_version v2) 使用 MD5 前 4 位 hex 作为行内容身份标识。这在大多数场景下足够，但当文件包含大量低熵行（`}`、`},`、空行、重复样板代码）时，4 位 hash 会在同一快照内产生歧义，导致 `anchor_ambiguous` 错误。

3.0 已解决 post-edit state handoff（返回 new_anchors、diff_preview、anchors_valid_through），但未解决锚点本身的 resolution quality。4.0 聚焦于：即使不考虑 stale state，当前 hash 是否能在单一文件版本内唯一解析目标行。

核心受影响的模块：`src/drivers/edit.ts`（hash 计算、验证、执行）和 `src/drivers/fs.ts`（read_file 输出）。

## Goals / Non-Goals

**Goals:**
- 消灭低熵行作为主锚点导致的 ambiguity 失败
- 当 4/6 位短 hash 不唯一时，工具内部自动扩展 hash 长度重试
- read_file 输出告知模型哪些行适合做锚点
- 歧义错误返回更多结构化信息帮助模型恢复
- 保持向后兼容：旧 agent 仍可用 4 位 hash，新 agent 自动获得 6 位 + 标注

**Non-Goals:**
- 不改变整体 hashline 协议方向（仍是 content-only identity）
- 不引入 local refresh 工具（那是后续独立的 change）
- 不改变 batch 原子性语义
- 不改动 write_file / overwrite_file 的 core 逻辑
- 不做 hash 算法替换（MD5 仍够用，这是非安全场景）

## Decisions

### D1: Hash 长度策略 — display 6 位 + resolution 8 位

```
computeLineHash(line) → 6 hex chars (display hash, 用于 read 输出标注)
computeResolutionHash(line) → 8 hex chars (内部 resolution 使用)
```

- **为什么选 6/8？** 4→6 从 16 bits 升到 24 bits，碰撞概率从 ~1/65K 降到 ~1/16M。8 位 = 32 bits，碰撞概率 ~1/4B，在百万行文件中仍然极低。
- **为什么不更激进（12/16）？** 增加显示噪声，6 位已足够人类区分。8 位 resolution hash 在歧义时才自动扩展使用。
- **替代方案**：keep 4 位 + 只靠 occurrence。被拒绝：occurrence 需要模型在 edit 调用时精确知晓目标行是第几个匹配，这对模型认知负担过大。

### D2: 低熵行判定标准

```
low-entropy := 去空白后满足任一:
  1. 长度 = 0（空行）
  2. 仅含 `{}()[]` 及 `,;` 组合（如 `},`、`);`）
  3. 仅含单个引号或短分隔符（`"`、`'`、`/>`）

medium := 不属于 low，但文件内出现 > 3 次（基于 content-only hash 统计）

high := 其他
```

- **为什么不用纯统计？** 始终基于统计意味着第一次读文件时不知道全局频率，要么需要额外 pass，要么不准确。先过滤明显的结构行，再结合出现次数做二次降级。
- **替代方案**：NLP entropy score。被拒绝：过重，代码场景不需要。

### D3: read_file 输出格式升级

```
v2: 118#5da3|  },
v3: 118#5da3f1 [low]   },
```

- 格式：`lineNum#displayHash [quality] content`
- `[quality]` 为 `low`/`med`/`high` 三值之一
- `details.recommended_anchors`: 返回所有 high-quality 锚点中前 20 个的 `lineNum#hash` 列表
- `anchor_format_version` → `"v3"`

### D4: Adaptive hash resolution 流程

```
resolveAnchor(hash, hashMap):
  1. 用 6 位 display hash 在 hashMap 中查找
  2. 若唯一 → 返回
  3. 若不唯一 → 扩展比较 8 位 resolution hash 前缀
  4. 若仍不唯一 → 加入 local context（相邻行 hash）
  5. 若仍不唯一 → 返回 ambiguity error（含 candidates + suggested_action）
```

这发生在 `validateOperations` 内部。对 agent 来说是透明的——它仍传 6 位 hash，工具内部自动处理歧义。

### D5: Context-augmented hash

`computeLineHash` 的输入改为：

```
identity = prevNonempty.trim() + "\n" + line.trim() + "\n" + nextNonempty.trim()
```

三行拼接后再 MD5。如果行为第一行/最后一行，缺失的邻居用空字符串代替。

- **为什么不用滑动窗口？** 三行窗口简单、确定性高。更大窗口会降低编辑灵活性（相邻行微调后 hash 就变）。
- **风险**：相邻行的变更会使 context hash 失效。这是可接受的——因为 context hash 只作为 secondary identity，primary identity 仍是单行 hash。

### D6: 错误分类细化

```
anchor_stale          → hash 在当前文件中完全不存在
anchor_prefix_ambiguous → 短 hash 匹配多个位置（工具已尝试扩展仍歧义）
anchor_context_ambiguous → context-augmented hash 也匹配多个位置
file_version_mismatch → expected_file_version 与当前文件不匹配（write_file / overwrite_file）
```

`suggested_action` 对应更新：
- `anchor_prefix_ambiguous` → `"use_context_anchor"`
- `anchor_context_ambiguous` → `"re-read_with_context"`
- `anchor_stale` → `"re-read_file"`

## Risks / Trade-offs

- **[R1] 显示 hash 从 4 位扩到 6 位增加 read 输出噪声** → 每行多 2 字符，在 200 行输出中多 400 字符（~2%），可忽略
- **[R2] context-augmented hash 在相邻行修改后失效更快** → 这是 trade-off：识别精度 vs 修改容忍度。context hash 仅作为 secondary，primary 仍是单行 hash
- **[R3] low-entropy 黑名单可能漏掉某些语言的特定模式** → 采用 3 层判定（结构过滤 + 频率统计 + 标识符比例），不完全依赖硬编码黑名单
- **[R4] v2→v3 协议升级** → `anchor_format_version` bump 已有机制，旧 agent read 到 v3 格式时能看到版本号并适应；hash 仍是 hex 字符串，old agent 仍能传 6 位 hash 给 edit
- **[R5] 性能：context hash 需要查找前后非空行** → O(n) 一次 pass，在 2MB 文件限制下可忽略

## Migration Plan

1. `ANCHOR_FORMAT_VERSION` = `"v3"`，`computeLineHash` 输出 6 位
2. `formatHashedLine` 追加 ` [quality]` 标注
3. edit tool 的 `validateOperations` 改用 adaptive resolution
4. 现有测试更新：hash 长度断言从 4 位改为 ≥6 位
5. 无需数据迁移，无 breaking API change

## Open Questions

- **O1**: `recommended_anchors` 返回前 N 个 high-quality 锚点——N 取多少？初步取 20。
- **O2**: 低熵行的 `>` 3 次阈值是否合理？需在实际 repo 中验证。
- **O3**: 是否需要在 error response 中增加 `candidate_preview`（展示候选行的前后文）？成本不高，可作为 P1 增强。
