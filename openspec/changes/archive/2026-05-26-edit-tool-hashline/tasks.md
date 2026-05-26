## 1. Hashline 哈希工具函数

- [x] 1.1 在 `src/drivers/edit.ts` 中实现 `computeLineHash(line: string, lineNumber: number): string` 函数：对 `line.trim() + "|" + lineNumber` 取 MD5，返回前 4 字符 hex
- [x] 1.2 实现 `hashLines(lines: string[]): Map<string, number>` 函数：为所有行构建 `hash → lineNumber` 映射，检测冲突并抛出错误
- [x] 1.3 实现 `formatHashedLine(lineNumber: number, hash: string, content: string): string` 函数：输出 `行号:哈希|内容` 格式

## 2. read_file 增强 — hashes 模式

- [x] 2.1 修改 `readFileParams` schema，新增可选 `hashes: Type.Optional(Type.Boolean(...))` 参数
- [x] 2.2 修改 `readFileTool.execute`：当 `hashes: true` 时调用 `computeLineHash` 为每行生成哈希，输出 `格式化行` 格式
- [x] 2.3 修改文件摘要行（截断时），在 hashes 模式下附带哈希启用提示
- [x] 2.4 验证默认 `hashes: false` 时不改变现有输出格式（向后兼容）

## 3. edit 工具核心实现

- [x] 3.1 定义 `EditOperation` 类型（`replace_line` / `replace_range` / `insert_after` / `insert_before` / `delete_line` / `delete_range`）及参数 schema（使用 `@mariozechner/pi-ai` 的 `Type`）
- [x] 3.2 定义 `editParams` schema：`file_path: string`、`operations: EditOperation[]`
- [x] 3.3 实现 `validateHashes(ops, hashMap): ValidationResult` 函数：检查所有操作引用的 hash 在 hashMap 中是否存在，返回缺失哈希列表或验证通过
- [x] 3.4 实现 `applyEditOperations(lines, ops, hashMap): string[]` 函数：按顺序在 lines 数组上执行所有操作，返回修改后的 lines（操作基于初始 hashMap 定位）
- [x] 3.5 实现 `editTool` AgentTool：组合验证 → 应用 → 写入流程，返回操作摘要
- [x] 3.6 实现错误处理：哈希不匹配返回清晰的错误消息（包含缺失哈希列表和 "re-read and retry" 提示），文件不存在返回标准错误

## 4. 驱动注册

- [x] 4.1 在 `src/drivers/registry.ts` 的 `BUILTIN_DRIVERS` 中新增 `edit` 驱动，注册 `editTool`
- [x] 4.2 确保 `editTool` 的 `executionMode` 设置为 `"sequential"`（文件写入需要串行执行）

## 5. 权限集成

- [x] 5.1 在 `src/permissions/rules.ts` 或权限配置中将 `edit` 工具纳入 `write` 类权限控制（与 `write_file` 使用相同的权限策略）

## 6. 测试验证

- [x] 6.1 编写 `computeLineHash` 的单元测试：验证确定性（相同输入 → 相同输出）、不同行号产生不同哈希、空白符 trim 行为
- [x] 6.2 编写 `hashLines` 的单元测试：验证映射构建、冲突检测
- [x] 6.3 编写 `editTool` 的集成测试：每种操作类型（replace_line、replace_range、insert_after、insert_before、delete_line、delete_range）的成功路径
- [x] 6.4 编写 `editTool` 的错误路径测试：哈希不存在时的拒绝行为、文件不存在、空操作列表
- [x] 6.5 编写批量操作的原子性测试：部分哈希无效时整个批次拒绝
- [x] 6.6 编写 `readFileTool` hashes 模式测试：验证输出格式、默认关闭时的向后兼容性
- [x] 6.7 运行 `npm test` 确保所有现有测试通过

## 7. 文档

- [x] 7.1 更新 `AGENTS.md` 中的内置驱动表，新增 `edit` 驱动条目
- [x] 7.2 在 edit 工具的 `description` 字段中提供清晰的使用说明和操作示例
