## 1. Hash 长度升级 + 双 tier hash

- [x] 1.1 `computeLineHash` 改为返回 6 位 hex (`MD5(line.trim()).slice(0, 6)`)
- [x] 1.2 新增 `computeResolutionHash` 返回 8 位 hex (`MD5(line.trim()).slice(0, 8)`)
- [x] 1.3 `hashLines` 和 `hashLinesUnique` 改用 8 位 resolution hash 建 map，同时保留 6 位 display hash 到行号的额外索引
- [x] 1.4 `formatHashedLine` 输出 6 位 display hash
- [x] 1.5 `ANCHOR_FORMAT_VERSION` 升级为 `"v3"`

## 2. 低熵行检测与分类

- [x] 2.1 新增 `classifyLineQuality(line: string): 'low' | 'medium' | 'high'` 函数，实现结构行黑名单判定
- [x] 2.2 新增 `classifyLinesWithFrequency(lines: string[]): Array<{line, quality}>` ，结合全局出现频率做 medium 判定（> 3 次降级）
- [x] 2.3 `formatHashedLine` 追加 ` [quality]` 输出：`N#XXXXXX [low]|content`

## 3. read_file 输出升级

- [x] 3.1 `readFileTool.execute` 在 `hashes: true` 时对每行调用质量分类并格式化
- [x] 3.2 计算 `recommended_anchors`：收集所有 high-quality 行的 `lineNum#hash`，上限 20，均匀分布
- [x] 3.3 `details` 中返回 `recommended_anchors` 数组
- [x] 3.4 更新文件摘要行格式以反映新锚点格式

## 4. Adaptive hash resolution

- [x] 4.1 在 `validateOperations` 中新增 `resolveAnchor(hash, hashMap, lines, displayToResolution)` 函数，实现三级阶梯：6 位 → 8 位 → context
- [x] 4.2 实现 context-augmented hash：`computeContextHash(lines, lineIdx)` 使用 `prev_nonempty + current + next_nonempty`
- [x] 4.3 Single-line 操作：替换原有的直接 `hashMap.get()` 为 `resolveAnchor()` 调用
- [x] 4.4 Range 操作：start_hash 和 end_hash 分别走 adaptive resolution

## 5. 低熵行锚点拦截

- [x] 5.1 在 `validateOperations` 中，single-line 操作解析完成后检查目标行 quality
- [x] 5.2 低熵行 single-line 操作返回 `anchor_low_entropy` 错误，含 `neighbor_anchors`
- [x] 5.3 计算 neighbor anchors：取目标行 ±3 范围内所有 high-quality 行的 `lineNum#hash`，上限 6 个

## 6. 错误分类细化

- [x] 6.1 新增错误类型：`anchor_prefix_ambiguous`、`anchor_context_ambiguous`、`anchor_low_entropy`
- [x] 6.2 `validateOperations` 返回细化错误码：prefix 歧义 vs context 歧义 vs low-entropy
- [x] 6.3 错误响应中 `suggested_action` 对应更新：`"use_context_anchor"` / `"re-read_with_context"` / `"use_neighbor_anchor"`
- [x] 6.4 `anchor_context_ambiguous` 错误在 candidates 中附加 content preview（截断到 40 字符）

## 7. Post-edit 输出更新

- [x] 7.1 `generateLocalDiff` 输出的 new anchors 使用 6 位 hash + quality 标注
- [x] 7.2 `write_file` 的 anchors preview 使用 6 位 hash 格式
- [x] 7.3 edit 成功返回的 `new_anchors` 和 `diff_preview` 使用新格式

## 8. 验证与收尾

- [x] 8.1 运行 `npm run typecheck` 零错误
- [x] 8.2 运行现有测试套件 `npm test` 确保无回归
- [x] 8.3 手动测试：对包含大量 `},` 的 TypeScript 文件执行 read+edit，验证低熵行被标记且 single-line 操作被正确拒绝
- [x] 8.4 手动测试：对重复样板语句文件执行 edit，验证 adaptive resolution 自动消歧成功
- [x] 8.5 验证 `anchor_format_version` 返回 `"v3"`
