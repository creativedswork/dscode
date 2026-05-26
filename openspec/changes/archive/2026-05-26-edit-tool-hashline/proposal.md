## Why

当前项目只有 `read_file`（全量读取）和 `write_file`（全量覆写）两种文件修改方式。对于大文件中的局部修改（如改一行代码、修复一个 bug），模型必须重写整个文件，浪费大量上下文 token 且增加出错概率。业界主流的 `str_replace` 方案（Claude Code、Gemini 等）要求模型精确复现空白符、缩进和原文本，实践中 "String to replace not found in file" 错误泛滥。Can Bölük 在 "The Harness Problem" 中的实验表明：仅改变 edit 工具格式，就能让 15 个 LLM 的代码修复成功率平均提升 8-20 个百分点，最弱模型甚至从 6.7% 跃升至 68.3%——这比大多数模型升级的收益更大，且零训练成本。项目需要一个基于 "Hashline" 理念的编辑工具，为模型提供稳定、可验证的行级锚点，从根本上解决"精确复现原文"这一痛点。

## What Changes

- **新增 `edit` 内置工具**：基于 Hashline 的行级编辑工具，支持 replace_line、replace_range、insert_after、insert_before、delete_line、delete_range 六种操作，通过内容哈希标签引用目标行。支持单次调用中批量执行多个操作。
- **修改 `read_file` 工具**：新增可选参数 `hashes: boolean`，启用后每行输出携带 2-3 字符的确定性内容哈希标签（格式：`行号:哈希|内容`），使模型能通过哈希标签而非原文内容定位编辑目标。
- **新增行级内容哈希算法**：基于行内容（去除首尾空白后）的确定性短哈希（xxhash 截断），同一文件内冲突概率极低，文件被外部修改后哈希不匹配则拒绝编辑。
- **新增编辑验证机制**：执行编辑前重新读取目标文件、重新计算哈希并与模型引用的哈希比对，不匹配则拒绝整个批次并返回清晰的冲突错误，避免文件损坏。

## Capabilities

### New Capabilities

- `hashline-read`: 增强的 read_file 输出格式，每行携带内容哈希标签，为 edit 工具提供稳定锚点
- `edit-tool`: 基于 Hashline 的 edit 内置工具，支持六种行级操作、批量执行、哈希验证与冲突拒绝

### Modified Capabilities

<!-- 现有能力无需求变更 -->

## Impact

- **工具系统**：`src/drivers/registry.ts` 注册新 edit 驱动；`src/drivers/fs.ts` 修改 `readFileTool` 支持 hashes 参数
- **新增文件**：`src/drivers/edit.ts` — edit 工具定义、哈希函数、验证逻辑
- **权限系统**：edit 工具需纳入 `write` 类权限控制（与 write_file 同级）
- **上下文效率**：模型不再需要全量覆写大文件，显著降低 output token 消耗
