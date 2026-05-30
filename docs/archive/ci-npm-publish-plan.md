# CI & npm 发布方案（参考 cline）

## cline 的做法

cline 的 npm 发布流程（`npm-main.yaml` + `scripts/package-npm.mjs`）：

```
CI (GitHub Actions)
  ├─ setup-node (Node 24.x, registry-url)
  ├─ npm ci --include-optional     ← 按 lockfile 精确安装
  ├─ node scripts/package-npm.mjs  ← 构建脚本（含 typecheck）
  │    ├─ 清理 dist-standalone/
  │    ├─ cd cli && npm run build:production  ← typecheck + esbuild
  │    ├─ cp cli/dist/ → dist-standalone/dist/
  │    ├─ cp cli/package.json → dist-standalone/
  │    └─ cp README.md → dist-standalone/
  └─ cd dist-standalone && npm publish
```

核心设计：
1. **构建和发布分离** — `dist-standalone/` 是干净的发布目录，只含编译产物 + package.json + README
2. **typecheck 集成在构建脚本里** — 不是独立的 CI step，构建失败 = typecheck 失败
3. **lockfile 一致性** — cline 的 lockfile 在 Linux CI 环境生成，和 CI runner 一致

## dscode 的适配方案

### 改造后的流程

```
CI (GitHub Actions)
  ├─ setup-node (Node 22)
  ├─ npm install                 ← 按 package.json 安装（不用 lockfile）
  ├─ node scripts/build.mjs      ← 构建脚本（含 typecheck）
  │    ├─ 运行 tsc --noEmit      ← typecheck
  │    ├─ esbuild 编译            ← src/ → dist/dscode.mjs
  │    ├─ 清理 dist-standalone/
  │    ├─ cp dist/ → dist-standalone/dist/
  │    ├─ cp package.json → dist-standalone/
  │    ├─ cp README.md → dist-standalone/
  │    └─ cp LICENSE → dist-standalone/
  └─ cd dist-standalone && npm publish
```

### 为什么用 `npm install` 而不是 `npm ci`

- macOS 生成的 lockfile 和 Linux CI runner 的 npm 版本不完全兼容
- `npm install` 读 `package.json` 安装，不依赖 lockfile 状态
- 之前 `npm ci` 在 CI 间歇性不装 devDependencies（`@types/node`）的原因就在此

### 为什么构建脚本包含 typecheck

- 参考 cline：`build:production` = `typecheck && esbuild`
- typecheck 不通过 → 构建失败 → CI 失败
- 减少 CI step 数量，逻辑内聚

### dist-standalone 的作用

- 发布的包只含运行时需要的文件：`dist/`、`package.json`、`README.md`、`LICENSE`
- 不包含 `src/`、`node_modules/`、`scripts/`、`tsconfig.json` 等开发文件
- `package.json` 中原有的 `files` 字段 + `dist-standalone/` 目录保证干净发布

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 重写 | `scripts/build.mjs` | 加入 typecheck + dist-standalone 组装 |
| 修改 | `package.json` | 更新 build 脚本和 files 字段 |
| 重写 | `.github/workflows/publish.yml` | 简化为: install → build → publish |

## 本地验证

```bash
rm -rf node_modules dist dist-standalone
npm install              # 模拟 CI 第一步
node scripts/build.mjs   # 模拟 CI 第二步：typecheck + 编译 + 组装
ls dist-standalone/      # 确认产出物
cd dist-standalone && npm pack --dry-run  # 预览发布内容
```