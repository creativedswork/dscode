## 1. Shell 工具异步化 (`src/drivers/shell.ts`)

- [x] 1.1 将 `import { execSync } from "node:child_process"` 替换为 `import { exec } from "node:child_process"`，并添加 `import { promisify } from "node:util"`
- [x] 1.2 创建 `const execAsync = promisify(exec)` 包装
- [x] 1.3 将 `execSync(command, {...})` 替换为 `await execAsync(command, {...})`
- [x] 1.4 适配错误处理：catch 块中 `err.stdout`/`err.stderr`/`err.code`（原 `err.status`）映射为 `exitCode`
- [x] 1.5 运行 `npm run typecheck` 确保类型通过

## 2. FS 工具异步化 (`src/drivers/fs.ts`)

- [x] 2.1 将 `import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from "node:fs"` 替换为 `import { readFile, writeFile, stat, readdir, mkdir, access } from "node:fs/promises"`
- [x] 2.2 添加 `async function fileExists(path: string): Promise<boolean>` 辅助函数（基于 `access` 或 `stat`）
- [x] 2.3 `readFileTool.execute`: `existsSync` → `await fileExists()`，`statSync` → `await stat()`，`readFileSync` → `await readFile()`
- [x] 2.4 `listFilesTool.execute`: `existsSync` → `await fileExists()`，`readdirSync` → `await readdir()`，同步递归 `walk` 改为 `async function walk`
- [x] 2.5 `writeFileTool.execute`: `existsSync` → `await fileExists()`，`readFileSync` → `await readFile()`，`mkdirSync` → `await mkdir()`，`writeFileSync` → `await writeFile()`
- [x] 2.6 `overwriteFileTool.execute`: 同上 pattern
- [x] 2.7 运行 `npm run typecheck` 确保类型通过

## 3. Search 工具异步化 (`src/drivers/search.ts`)

- [x] 3.1 将 `import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"` 替换为 `import { readFile, readdir, stat } from "node:fs/promises"`，添加 `fileExists` 辅助函数
- [x] 3.2 `walkDir` 函数改为 `async function`：`readdirSync` → `await readdir()`，`statSync` → `await stat()`，递归调用加 `await`
- [x] 3.3 `grepTool.execute`: `existsSync` → `await fileExists()`，`statSync` → `await stat()`，`readFileSync` → `await readFile()`
- [x] 3.4 `globTool.execute`: `existsSync` → `await fileExists()`，`walkDir` 调用加 `await`
- [x] 3.5 运行 `npm run typecheck` 确保类型通过

## 4. Edit 工具异步化 (`src/drivers/edit/tool.ts`)

- [x] 4.1 将 `import { readFileSync, writeFileSync, existsSync } from "node:fs"` 替换为 `import { readFile, writeFile, stat } from "node:fs/promises"`
- [x] 4.2 添加 `fileExists` 辅助函数（或直接 try/catch stat）
- [x] 4.3 `editTool.execute`: `existsSync` → `await fileExists()`，`readFileSync` → `await readFile()`，`writeFileSync` → `await writeFile()`
- [x] 4.4 运行 `npm run typecheck` 确保类型通过

## 5. 验证

- [x] 5.1 启动 TUI 模式 (`npm start`)，执行一个耗时 bash 命令（如 `sleep 3 && echo done`），观察计时器和 spinner 是否持续更新
- [x] 5.2 执行 `read_file` 读取大文件，观察 TUI 是否流畅
- [x] 5.3 执行 `write_file` + `edit` 组合操作，验证编辑流程正常
- [x] 5.4 执行 `grep` 和 `glob`，验证搜索结果正确
- [x] 5.5 运行 `npm test` 确保现有测试通过
