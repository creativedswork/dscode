## 1. CLI — 参数解析与环境检测

- [ ] 1.1 在 `src/core/main.ts` 中新增 `isDevMode()` 函数，通过 `import.meta.url` 判断是否从源码运行
- [ ] 1.2 扩展 `parseArgs()` 返回值类型，新增 `debug: boolean` 字段
- [ ] 1.3 在 `parseArgs()` 中解析 `--debug` 参数（仅在 `isDevMode()` 为 true 时生效，否则忽略）
- [ ] 1.4 在 `main()` 中将 `debug` 传入 `new Harness(config, debug)`

## 2. Harness — debug 模式 System Prompt 写入文件

- [ ] 2.1 `Harness` 构造函数新增可选参数 `debug?: boolean`，存储为 `private debug: boolean`
- [ ] 2.2 新增私有方法 `dumpDebugPrompt()`：使用 `writeFileSync` 将当前 `this.agent.state.systemPrompt` 写入 `dscode/dump/system-prompt.md`（自动创建 `dump/` 目录）
- [ ] 2.3 在 `initialize()` 末尾，若 `this.debug` 为 true，调用 `dumpDebugPrompt()`
- [ ] 2.4 在 `transformContext` 回调中，若 debug 且 system prompt 发生变化，调用 `dumpDebugPrompt()`
- [ ] 2.5 使用 `private debugPromptLastHash` 缓存上次输出的 prompt hash，避免重复写入相同内容

## 3. 验证

- [ ] 3.1 `npm run typecheck` 通过
- [ ] 3.2 `npm test` 通过
- [ ] 3.3 手动验证：`npm start -- --debug` 在 `dscode/dump/system-prompt.md` 中生成 System Prompt 文件
- [ ] 3.4 手动验证：`npm start`（不带 --debug）不生成 System Prompt 文件
- [ ] 3.5 构建验证：`npm run build` 后 `node dist/dscode.mjs --debug` 不生成文件（npm 包不可见）
- [ ] 3.6 验证 `.gitignore` 中包含 `dump/` 条目
