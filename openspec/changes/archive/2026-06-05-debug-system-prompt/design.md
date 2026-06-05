## Context

当前 dscode 的 System Prompt 构建链路为：

1. `loadConfig()` 加载配置
2. `Harness.initialize()` → `buildSystemPrompt(memories, skillSection)` → `this.baseSystemPrompt`
3. Agent 每次请求前 `transformContext` 回调将 `this.baseSystemPrompt + deferredHint` 写入 `this.agent.state.systemPrompt`

这个运行时 system prompt 是最终发送给模型的内容，但开发者无法在终端直接观察它。需要一种轻量的调试手段。

## Goals / Non-Goals

**Goals:**
- 开发者可通过 `--debug` 标志将完整的运行时 System Prompt（含 deferred tools hint）写入 `dscode/dump/system-prompt.md`
- debug 标志**仅在从源码运行时生效**，npm 包（`dist/dscode.mjs`）中 `--debug` 无任何效果
- 输出到 `dscode/dump/` 目录下的 `.md` 文件，不污染终端 stdout/stderr 工具调用流
- 实现简洁，不引入新依赖或配置字段

**Non-Goals:**
- 不在 npm 构建产物中暴露 `--debug` 功能——这是硬约束
- 不修改 `HarnessConfig` 或配置持久化——debug 是临时开关
- 不做复杂文件轮转策略——每次 `initialize()` 或 prompt 重建都覆盖写入 `system-prompt.md`
- 不提供 System Prompt 的格式化/美化为 markdown——原文原样输出
- 不通过环境变量触发（`DSCODE_DEBUG` 等）——保持接口单一

## Decisions

### Decision 1: npm 包不可见 = 运行时路径检测

检测方式：在 `parseArgs()` 中通过 `import.meta.url` 判断当前文件路径。

```ts
function isDevMode(): boolean {
  const url = import.meta.url;
  // 从源码运行：file:///.../src/core/main.ts
  // npm 包运行：file:///.../dist/dscode.mjs
  return url.includes("/src/core/main.ts");
}
```

**为什么不用环境变量或 define 注入：**
- `process.env.DSCODE_DEV` 需要开发者手动设置，体验差
- esbuild `define` 注入需要额外构建配置，且调试时需要特殊构建命令
- 路径检测是零配置的，`npm start` → 自动进入 dev 模式；`dscode` 二进制 → 自动屏蔽

**为什么不用 `fileURLToPath`：** Windows 兼容性。使用字符串 includes 判断路径片段即可，无需完整路径解析。

**Risk:** 如果用户把源码 clone 到路径中包含 `/src/core/main.ts` 字符串的目录，会误触发。但这需要目录名恰好叫 `src/core/main.ts`，概率极低且无安全风险（只是多写一个文件）。不做特殊处理。

### Decision 2: debug 标志传递方式

`parseArgs()` 返回 `{ debug: boolean }`，仅在 `isDevMode() === true` 时解析 `--debug` 参数。

`main()` 将 `debug` 通过 Harness 构造函数传入（新增可选参数 `debug?: boolean`），Harness 内部存储为 `private debug: boolean`。

**为什么不放在 config 中：** debug 是临时运行时标志，不应进入 `HarnessConfig`（会被序列化/持久化）。

### Decision 3: System Prompt 输出时机与内容

**时机 1：`initialize()` 末尾** — `this.baseSystemPrompt` 构建完成后立即输出。

**时机 2：`transformContext` 回调中** — 当 system prompt 更新时（`baseSystemPrompt + deferredHint`），仅在首次变化时输出，避免每个 turn 都重复打印。

实际实现：在 `initialize()` 中输出 `baseSystemPrompt`；同时由于 deferred tools hint 是动态的，在 `transformContext` 中也输出一次 full prompt（用 flag 防止重复）。

最优方案：仅在 `initialize()` 末尾输出完整的 `this.agent.state.systemPrompt`（此时 deferredHint 已由 transformContext 首次构建），并 watch 后续 transformContext 中的变化。

简化方案：在 `initialize()` 末尾输出 `this.agent.state.systemPrompt`，然后在 `transformContext` 中用一个 `private debugPromptPrinted = false` 标记首次输出后的变化。

**输出格式：**

System Prompt 作为 Markdown 文件写入 `dscode/dump/system-prompt.md`，内容直接以 System Prompt 原文写入，无需额外元数据包裹。文件路径使用 `this.config.projectPath` 作为基准：

```
dscode/dump/system-prompt.md
```

每次 prompt 更新时覆盖写入，开发者可用编辑器或 `cat` 直接查看。

### Decision 4: 文件输出 (`dscode/dump/`)

使用 `node:fs.writeFileSync()` 写入 `dscode/dump/system-prompt.md`，而非 stderr 终端输出。理由：

- System Prompt 通常很长（10K+ chars），终端刷屏体验差
- `.md` 文件可在编辑器中查看，支持搜索、折叠、对比
- `dump/` 目录语义清晰——调试产物临时存放处
- 利用 `.gitignore` 中 `dump/` 规则自动防止误提交

输出前自动创建 `dump/` 目录（`mkdirSync({ recursive: true })`）。
### Decision 5: 不与现有技能加载冲突

debug 输出完全是附加的副作用，不修改任何现有逻辑路径。不创建新 tool，不修改 prompt 内容，不改变 Agent 行为。

## Risks / Trade-offs

- **[Risk] 路径检测在 esbuild bundle 后失效**：esbuild 打包后 `import.meta.url` 指向 `dist/dscode.mjs`，不包含 `/src/core/main.ts`，因此自动屏蔽。这正是期望行为。
  → 但 `npm start` 使用 `tsx` 直接运行源码，路径正确。确认无误。

- **[Risk] System Prompt 可能很长（10K+ chars）**：输出到 `dscode/dump/` 文件而非终端，不影响工具调用解析。`dump/` 目录被 .gitignore 排除，不会误提交。开发者可通过编辑器打开查看全文。

- **[Trade-off] 不做增量打印**：每次 `initialize()` 或 prompt 重建都覆盖写入 `system-prompt.md`，不做 diff。简单且够用。如果将来需要 diff，可以在此基础上迭代。

## Open Questions

- 是否需要在 `--debug` 模式下也打印每次 API 请求的 messages？（建议作为后续工作，单独提案）
