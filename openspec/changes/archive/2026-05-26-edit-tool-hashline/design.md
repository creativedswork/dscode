## Context

当前项目的文件写入路径是 `read_file`（读取全量内容）→ 模型思考 → `write_file`（全量覆写）。对于超过 ~200 行的文件，每次修改都需要模型重新输出整个文件，这在以下场景尤为低效：

- 大文件中修改 1-2 行（如修复 typo、调整常量、加一行日志）
- 多位置分散修改（如重命名变量在多处出现）
- 上下文窗口紧张时，输出整文件消耗大量 token

业界方案对比（来自 "The Harness Problem" 实测数据）：

| 方案 | 代表实现 | 核心问题 |
|------|----------|----------|
| `apply_patch` | Codex/OpenAI | 模型必须学会专有 diff 方言，跨模型兼容性差（Grok 4 patch 失败率 50.7%） |
| `str_replace` | Claude Code, Gemini | 模型必须精确复现原文本（含 whitespace），"String not found" 是最常见错误 |
| NN merge | Cursor (70B fine-tune) | 需要额外模型推理，增加延迟和成本 |
| `write_file` | 本项目当前 | 全量覆写，大文件极浪费 |

**Hashline 方案**（Can Bölük, oh-my-pi）：在 read_file 输出中为每行添加 2-3 字符的内容哈希标签，模型通过哈希引用目标行，无需复现原文本。

## Goals / Non-Goals

**Goals:**
- 实现 `edit` 工具，支持 replace_line、replace_range、insert_after、insert_before、delete_line、delete_range 六种操作
- 所有操作通过行哈希标签定位目标，模型无需复现原文本内容
- 单次 edit 调用支持批量多个操作，原子执行（全部成功或全部拒绝）
- 执行前验证：重新读取文件并计算哈希，与模型引用的哈希比对，不匹配则拒绝
- `read_file` 新增 `hashes: true` 可选参数，启用 hash 行格式输出

**Non-Goals:**
- 不修改 `write_file` 的行为（保留全量覆写能力，作为兜底方案）
- 不支持跨文件编辑（单次 edit 调用只操作一个文件）
- 不实现语义 diff 或 AST 级编辑（那是更高级的后续方向）
- 不同步追踪外部修改（文件被外部修改后哈希不匹配 → 拒绝编辑，让模型重新读取并重试）

## Decisions

### 1. 哈希算法选择：xxhash32 截断为 2-3 字符 hex

**决策**：使用 `xxhash32`（Node.js `crypto` 或 `xxhash-wasm`）对每行的 **trimmed content** 计算哈希值，取低 12 bits 编码为 2-3 字符 hex 作为行标签。例如 `function hello() {` → 经 trim → hash → `a3`。

**理由**：
- xxhash 确定性高、计算极快（比 MD5/SHA 快 10x+），适合逐行计算
- 2-3 字符（12 bits = 4096 种可能）对于单个文件内的行区分足够：即使 1000 行的文件，4096 种哈希下的期望冲突数 < 1（生日悖论：1000^2 / (2*4096) ≈ 122，但实际要考虑同一文件内相似行很多）。因此使用 **3 字符 hex（12 bits 但用 3 hex chars = 12 bits 编码为 3 字符 base-16）** → 实际 4096 空间偏小。改用 **16 bits → 4 字符 hex** 提供 65536 空间，1000 行文件期望冲突 < 8，单次编辑操作可用 [hash + 行号] 联合定位。
- **关键修正**：最终采用 **行内容 trimmed + 行号** 联合哈希（`xxhash32(line.trim() + "|" + lineNumber)`），这样即使两行内容完全相同（如两个 `}`），行号不同也会产生不同哈希。哈希值取 16 bits → 4 hex 字符。此方案消除了同内容行的冲突问题。

**替代方案**：
- MD5 截断：过重，且输出更多字符
- 纯随机标签：非确定性，每次读取标签不同，模型无法记住
- 行号直接引用：行号在文件修改后会偏移，不可靠

### 2. read_file 的 hashes 模式输出格式

**决策**：当 `hashes: true` 时，每行格式为 `行号:哈希|内容`，例如：
```
1:a3f1|function hello() {
2:b2e4|  return "world";
3:c1d0|}
```
文件末尾的摘要行也改为显示哈希版本信息。默认 `hashes: false`，保持向后兼容。

**理由**：
- 向后兼容：默认不输出哈希，现有依赖 read_file 的逻辑不受影响
- 格式紧凑：哈希仅增加 5 字符/行（`:xxxx|`），对上下文增加可控
- 模型友好：格式简单，LLM 天然能解析 `行号:哈希` 模式

### 3. edit 工具的操作模型

**决策**：edit 工具接受以下参数：
```typescript
{
  file_path: string;                          // 目标文件绝对路径
  hashes: Record<string, string>;             // { "a3f1": "第1行哈希", ... } 模型从 read_file 获取
  operations: EditOperation[];                // 有序操作列表
}
// EditOperation = 
//   { op: "replace_line", hash: string, content: string }
//   | { op: "replace_range", start_hash: string, end_hash: string, content: string }
//   | { op: "insert_after", hash: string, content: string }
//   | { op: "insert_before", hash: string, content: string }
//   | { op: "delete_line", hash: string }
//   | { op: "delete_range", start_hash: string, end_hash: string }
```

**执行语义**：
1. 重新读取 `file_path`，为每行计算哈希
2. 验证所有引用的 hash 在当前文件中存在（且唯一），若不匹配则立即拒绝，返回缺失/冲突的哈希列表
3. 按 operations 顺序依次应用修改（后续操作作用在前序操作的结果上）
4. 全部成功后将结果写入文件
5. 返回修改摘要（操作数、变更行数）

**理由**：
- `hashes` map 让工具能验证哈希→行号的映射关系，模型只需提供从 read_file 输出中看到的哈希值
- 操作按顺序执行，支持"先删第 5 行，再在第 3 行后插入"这类依赖顺序的操作
- 原子执行：任何哈希验证失败 → 整个批次拒绝，避免部分修改导致的文件损坏

**替代方案**：
- 单操作 per call：简单但低效，多次修改需多次调用
- 模型直接给行号：行号在外部修改后偏移，不可靠
- 模型给 diff/patch：跨模型兼容性差（见上文 benchmark 数据）

### 4. 验证与冲突检测

**决策**：在执行任何编辑操作前，做一次"预验证"：
1. 读取目标文件当前内容
2. 为每一行计算哈希（使用与 read_file 相同的算法）
3. 构建 `hash → lineNumber` 映射
4. 检查 operations 中所有引用的 hash 是否在映射中存在
5. 若任何 hash 未找到 → 拒绝整个批次，返回错误：
   ```
   Edit rejected: file has changed since last read.
   Missing hashes: [a3f1, c1d0]
   Hint: re-read the file and retry.
   ```

**理由**：
- 乐观并发控制：假设大多数情况下文件未被外部修改
- 快速失败：在写入前检测冲突，避免文件损坏
- 清晰的错误信息让模型知道下一步该做什么（重新 read → 重新 edit）

### 5. 与 write_file 的关系

**决策**：`edit` 和 `write_file` 并存。`edit` 是推荐的局部修改方式，`write_file` 保留用于：
- 创建新文件
- 小文件的全量重写（< 50 行时 write_file 更简单）
- edit 失败后的 fallback

**理由**：不给模型增加强制约束。模型可以根据文件大小和修改范围自行选择最优工具。Hashline edit 的性能优势在大文件中体现，小文件直接用 write_file 更简单。

### 6. 哈希函数实现

**决策**：使用 Node.js 内置 `crypto.createHash('md5')` 计算后截断前 16 bits（4 hex chars），而非引入额外依赖。

**理由**：
- 零外部依赖：Node.js 内置 crypto 模块即可
- MD5 对于此用途足够（我们只需要同一文件内的行区分，不需要密码学安全）
- MD5 计算速度快，且 Node.js 原生实现高度优化
- 最终输出 4 hex 字符（16 bits）= 65536 种可能，单文件冲突概率极低

**替代方案**：xxhash 更快但需额外依赖（`xxhash-wasm`），且项目规模不大时 crypto 足够。

## Risks / Trade-offs

- **[哈希碰撞]** 同文件内两行不同内容产生相同 16-bit 哈希 → 概率 ≈ n²/(2*65536)，n=1000 时 ≈ 7.6 次期望碰撞 → 通过 [内容+行号] 联合哈希消除，即使内容相同行号也不同
- **[模型不理解哈希格式]** 部分模型可能直接复制行号而无视哈希 → 在工具 description 中提供清晰的示例和说明，并在验证阶段拒绝无效引用
- **[edit 工具增加 prompt 复杂度]** 多一个工具意味着更多的 tool description token → edit 工具带来的 output token 节省远超 description token 开销（大文件修改从输出千行变为输出几行）
- **[read_file hashes 输出的 token 开销]** 每行多 5 字符 → 1000 行文件多 ~5000 字符 ≈ ~1250 token → 对一次性的编辑任务来说可接受，但对多次读取场景有累积成本 → 默认 `hashes: false`，仅在需要编辑时启用

## Open Questions

- 是否需要在 edit 工具的返回结果中附带新的文件哈希，使模型可以连续编辑而不重新 read？→ 暂不实现，先走"read → edit → 如需再编辑 → 重新 read"的简单路径
- 是否支持 `replace_line` 时省略 hash（用行号 fallback）？→ 暂不支持，保持"哈希是唯一锚点"的清晰语义
