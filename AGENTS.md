# AGENTS.md

本文件供 AI Agent 快速理解项目结构。


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
