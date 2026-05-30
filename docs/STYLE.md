# 编码规范

工具链：仅 `tsc --strict`，不引入额外 linter/formatter。
风格基准：[Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) 的关键子集。

---

## 格式

| 项目 | 规则 |
|------|------|
| 缩进 | 2 spaces |
| 分号 | 必须 |
| 引号 | 双引号 (字符串)，模板字符串用于拼接 |
| 尾逗号 | 多行时必须 (trailing comma) |
| 行宽 | 100 字符软限制，120 硬限制 |
| 文件编码 | UTF-8，LF 换行 |

---

## 命名

| 实体 | 风格 | 示例 |
|------|------|------|
| 文件/目录 | kebab-case 或短单词 | `manager.ts`, `store.ts`, `compaction.ts` |
| 类 | PascalCase | `SessionManager`, `ContextManager` |
| 接口/类型 | PascalCase | `TokenBudget`, `PermissionRule` |
| 枚举 | PascalCase 枚举名, UPPER_CASE 成员 | `enum Level { OFF, LOW, MEDIUM }` |
| 函数/方法 | camelCase | `estimateTokens()`, `loadSession()` |
| 变量/参数 | camelCase | `sessionId`, `maxRetries` |
| 常量 (模块级不可变) | UPPER_CASE | `DEFAULT_RULES`, `MAX_CONTEXT_RATIO` |
| 私有成员 | 无前缀下划线，用 `private` 关键字 | `private store: SessionStore` |
| Boolean | is/has/can/should 前缀 | `isStreaming`, `hasQueuedMessages` |

---

## 导出

- 每个模块有一个明确的公共 API 表面
- 优先 named exports，避免 default export
- 类型和值分开导出：`export type { ... }` vs `export { ... }`
- re-export 集中在模块的 `index.ts`（如果有的话）

```typescript
// good
export { SessionManager } from "./manager.js";
export type { SessionMetadata, SerializedSession } from "./types.js";

// avoid
export default class SessionManager { ... }
```

---

## Import 顺序

1. Node.js 内置模块 (`node:fs`, `node:path`)
2. 第三方依赖 (`@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`)
3. 项目内部模块 (相对路径)

组间空行分隔：

```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";

import { Agent } from "@mariozechner/pi-agent-core";
import { getModel, streamSimple } from "@mariozechner/pi-ai";

import { SessionManager } from "../session/manager.js";
import type { HarnessConfig } from "./types.js";
```

---

## 类型

- 优先 `interface` 用于对象形状（可被 extends / implements）
- 用 `type` 做联合、交叉、映射类型
- 避免 `any`，必要时用 `unknown` + 类型守卫
- 函数签名中参数和返回值必须显式标注（除非推断明显）
- 泛型参数用单大写字母（`T`, `K`）或有意义的短名（`TParams`, `TApi`）

```typescript
// interface for object shapes
interface TokenBudget {
  contextWindow: number;
  availableForMessages: number;
}

// type for unions
type CompactionStrategy = "drop-oldest" | "sliding-window" | "summarize-prefix";

// type for computed types
type PermissionDecision = "allow" | "deny" | "ask";
```

---

## 模块结构

每个 feature module 内的文件组织：

```
skills/
├── registry.ts       # 主类 / 主逻辑
├── fs.ts             # 子功能：文件工具
├── shell.ts          # 子功能：shell 工具
└── search.ts         # 子功能：搜索工具
```

- 一个文件一个主要职责
- 文件不超过 300 行（超过则拆分）
- 公共类型如果仅一个模块用，放在该模块文件顶部
- 跨模块共享类型放 `core/types.ts`

---

## 错误处理

- 用自定义 Error 子类区分错误类型
- 系统边界（用户输入、文件 I/O、网络）做防御性校验
- 内部模块间调用信任参数，不重复校验
- 不吞异常：catch 后要 rethrow、log 或返回错误

```typescript
class SessionNotFoundError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}
```

---

## 异步

- `async/await` 优先，不用 raw Promise chains
- 不 await 无关的 promise（如 fire-and-forget 的保存操作用 `void save()`）
- `AbortSignal` 传递贯穿异步链路

---

## 注释

- 默认不写注释
- 仅在 WHY 不明显时写（隐藏约束、workaround、非直觉行为）
- 不写 JSDoc（除非是面向外部消费者的公共 API）
- 不注释 WHAT（命名应自解释）

```typescript
// CJK characters average ~2.5 chars per token vs 3.5 for Latin.
// pi-ai provides no tokenizer, so we use this heuristic.
const divisor = 3.5 * (1 - cjkRatio) + 2.5 * cjkRatio;
```

---

## 文件头部

不加 license header、作者信息、创建日期等样板。

---

## 测试（未来）

- 测试文件与源文件同目录：`manager.ts` → `manager.test.ts`
- 测试用 `vitest` 或 Node.js 内置 test runner
- 命名：`describe("SessionManager")` → `it("saves session to disk")`
