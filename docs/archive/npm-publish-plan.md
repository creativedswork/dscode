# npm 发布方案

参考 cline 的做法，核心思路：**编译为 JavaScript 后发布，而非发布 TypeScript 源码**。

## 现状问题

当前尝试直接发布 TypeScript 源码，依赖 `tsx` 在运行时编译。这导致：
1. GitHub Actions 中 `npm install` 间歇性失败（npm "Exit handler never called!" bug）
2. 用户必须安装 `tsx` 才能运行（多个运行时依赖）
3. 启动慢（每次都要编译）

## cline 的做法

```
源码 (TypeScript) → esbuild 打包 → dist/cli.mjs (单文件 + shebang) → npm publish
```

- 用 esbuild 将 TypeScript 编译并打包为一个 ESM 文件
- 文件头加 `#!/usr/bin/env node` shebang
- `bin` 指向编译产物 `dist/cli.mjs`
- 发布的是编译后的 JS，用户无需 `tsx`
- CI 用 Node 20+，无需特殊处理 npm bug

## 实施方案

### 1. 添加 esbuild 构建

新增 `scripts/build.mjs`，参考 cline 的 `cli/esbuild.mts`：

```
入口: src/core/main.ts
输出: dist/dscode.mjs
格式: ESM，带 shebang
目标: node20
外部模块: 保留运行时依赖，不打包进 bundle
```

`package.json` 增加脚本：
```json
"build": "node scripts/build.mjs",
"prepublishOnly": "npm run build"
```

### 2. 调整 package.json

```json
"bin": { "dscode": "dist/dscode.mjs" },
"main": "dist/dscode.mjs",
"files": ["dist/", "package.json", "README.md", "LICENSE"]
```

- `tsx` 移回 devDependencies（运行时不再需要）
- `engines.node` 保持 `>=20.0.0`

### 3. 更新 CI

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "20"
- run: npm ci          # 只安装 devDependencies 用于 typecheck + test
- run: npm run build   # esbuild 编译
- run: npm publish --access public
```

### 4. 调整源码

`main.ts` 需要适配 esbuild 打包后的环境（路径解析、资源加载等）。目前代码中硬编码的相对路径可能需要改为 `import.meta.url` 基准。

### 5. 删除临时文件

- `bin/dscode.js` — 被 `dist/dscode.mjs` 替代

## 文件变更清单

| 操作 | 文件 |
|------|------|
| 新增 | `scripts/build.mjs` |
| 修改 | `package.json` |
| 修改 | `.github/workflows/publish.yml` |
| 删除 | `bin/dscode.js` |
| 可能修改 | `src/core/main.ts`（路径适配） |

## 本地验证步骤

```bash
npm run build          # 编译
node dist/dscode.mjs   # 验证能启动
npm pack --dry-run     # 预览发布内容
```