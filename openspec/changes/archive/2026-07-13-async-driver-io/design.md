## Context

当前 `src/drivers/` 下四个文件的工具实现全部使用 Node.js 同步 I/O（`readFileSync`、`writeFileSync`、`execSync` 等），导致工具执行期间 Node.js 事件循环完全阻塞，TUI 的 timer、spinner 动画冻结。工具 `execute` 函数签名已标记为 `async`，pi-agent 也使用 `await tool.execute()` 调用，异步化完全安全。

## Goals / Non-Goals

**Goals:**
- 将 shell、FS、search、edit 四个驱动的所有同步 I/O 替换为 `fs/promises` 或 promisified `exec`
- 工具行为语义不变（输入输出、错误码、版本检查逻辑保持一致）
- 工具执行期间事件循环保持空闲，TUI 渲染流畅

**Non-Goals:**
- 不修改 pi-agent 调用链（已支持 async）
- 不引入 Worker Thread 或其他并发模型
- 不修改 TUI 渲染逻辑
- 不改变工具 API 签名

## Decisions

### D1: 使用 `fs/promises` 而非 `fs` callback API

**选择**: `import { readFile, writeFile, stat, readdir, mkdir, access } from "fs/promises"`

**理由**: 工具 `execute` 函数已是 `async`，`await` + `fs/promises` 语法最简洁。callback API 需要手动 `new Promise` 包装，增加样板代码。

**替代方案**: `fs.promises` 别名（功能相同，仅导入路径不同）。选择显式 import 以明确依赖。

### D2: Shell 工具使用 `child_process.exec` 包装为 Promise

**选择**: 手动包装 `exec` 为 Promise，保持与 `execSync` 相同的错误形状：
```
try {
  const { stdout } = await execAsync(command, { timeout })
  return { content, details: { exitCode: 0 } }
} catch (err) {
  // err.stdout, err.stderr, err.code — 与 execSync 的 ExecSyncError 形状一致
  return { content, details: { exitCode: err.code, error: true } }
}
```

**理由**: `exec` 的 Error 对象携带 `.stdout`/`.stderr`/`.code`，与 `execSync` 抛出的 `ExecSyncError` 形状一致（只是属性名 `err.code` vs `err.status`，需要适配）。

**替代方案**: `spawn` — 更底层但需要手动收集 stdout/stderr buffer，无额外收益。

### D3: `existsSync` 替换为 `access` 或 `stat`

**选择**: 使用 `stat(path).then(() => true).catch(() => false)` 的辅助函数。对于需要 stat 结果的场景（如文件大小检查），直接 `try { const s = await stat(path) } catch { ... }`。

**理由**: `fs/promises` 没有 `exists` 方法（deprecated）。`access` 检查权限，`stat` 同时获取元数据。根据上下文选择最合适的。

### D4: 递归遍历改为 async 递归函数

**选择**: `walkDir` 和 `listFiles` 的 `walk` 从同步递归改为 `async function` + `await readdir()` + `await Promise.all(walkDir(...))`（或顺序 `await`）。

**理由**: 目录遍历的 I/O 密集操作天然适合并行，但搜索和列表工具的输出顺序不重要，顺序 `await` 更简单且避免过多并发。

### D5: `edit` 工具保持相同的 checkpoint/snapshot 时序

**选择**: checkpoint 操作（`cpm.save()`、`fwt.recordWrite()`、`ss.invalidate()`）本身是同步或微异步，在 `await writeFile()` 前后调用顺序不变。

**理由**: checkpoint manager 和 snapshot store 的接口可能为同步——不改动它们，仅在 FS 操作处 await。

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| `exec` 版本的错误对象属性名（`.code` vs `.status`）与 `execSync` 不同 | 仔细适配 catch 块，统一映射为 `exitCode` |
| 异步递归在大目录可能产生大量并发 microtask | `walkDir` 使用顺序 `await` 而非 `Promise.all`，控制并发 |
| `fs/promises` 在极旧 Node 版本不可用 | 项目目标 Node ≥18，已内置 stable |
| edit 工具的 undo-store 和 syntax-validate 可能有同步依赖 | 仅修改 FS I/O 调用，不碰编辑逻辑 |
