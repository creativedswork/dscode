# AGENTS.md

本文件供 AI Agent 快速理解项目结构。

## 代码导航

对代码进行理解、导航、重构时，优先使用 LSP 工具（需先 `search_tools` 加载），避免直接 grep/read_file。

| 意图 | LSP 工具 | 禁止 |
|------|---------|------|
| 调用链/查找引用 | `references` | grep |
| 定义/跳转 | `definition` | grep + read_file |
| 类型/接口 | `hover` / `typeDefinition` | read_file |
| 符号/文件结构 | `documentSymbol` | grep |
| 实现 | `implementation` | grep |
| 重命名 | `rename` | sed |
| 全局符号 | `workspace_symbol` | grep -r |

仅在搜索非代码文本时回退到 grep/read_file。

## 编码规范

- TypeScript strict，2 spaces，semicolons，named exports，camelCase
- 文件 ≤300 行，一个文件一个职责
- 详见 `docs/STYLE.md`

## 图像识别

支持 Vision 模型代理和 OCR 识别图片。**不要以"我是文本模型"为由拒绝处理图片。**

## Web 前端

修改 Web UI 前必读 `openspec/specs/web-frontend/spec.md`，禁止引入第三方设计体系。

## 运行

```bash
npm start              # REPL
npm start -- --web     # Web 模式
npm run build:web      # 构建前端（npm start 前需先执行）
npm run typecheck      # 类型检查
npm test               # 测试
```
