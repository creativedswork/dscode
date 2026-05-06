# 设计决策记录

## ADR-1: 用 hook 注入而非继承/包装 Agent

**决策**: 通过 `transformContext`、`beforeToolCall`、`afterToolCall` hook 扩展 Agent 行为，不继承或 monkey-patch Agent 类。

**理由**:
- pi-agent-core 明确设计了这些 hook 作为扩展点
- 保持与库版本升级的兼容性
- 避免紧耦合，各层通过 hook 注入实现松耦合

**影响**:
- 无法拦截 hook 未暴露的环节（如 `convertToLlm` 之后的处理）
- 可接受：我们的需求均可通过已有 hook 满足

---

## ADR-2: 启发式 Token 估算

**决策**: 使用字符数除法（英文 /3.5, CJK /2.5）估算 token 数，用运行时 usage 校准。

**理由**:
- pi-ai 不提供本地 tokenizer
- 引入 tiktoken 等依赖增加复杂度和包大小
- 对于 context budget 管理，±20% 精度足够（目标利用率 85%）
- `isContextOverflow()` 作为兜底安全网

**影响**:
- 压缩触发时机可能略早或略晚
- 运行时校准逐渐收敛到真实比例
- 最坏情况：overflow → 检测 → 强制压缩 → retry

---

## ADR-3: JSON 文件存储

**决策**: 所有持久化（session、memory）使用 JSON 文件，不引入数据库。

**理由**:
- 零外部依赖，适合 CLI 工具的分发
- 人类可读可编辑（用户可手动修改记忆或修复损坏）
- 单用户场景无并发问题
- 单 session 文件通常 < 1MB

**影响**:
- 无索引，list 操作需遍历
- 无事务保证（通过原子写入缓解：write tmp → rename）
- 若未来需要更复杂查询，可替换 store 实现为 SQLite

---

## ADR-4: Skills 静态加载

**决策**: Skills 在启动时加载，不支持运行时热重载。

**理由**:
- 热重载增加复杂度（file watcher、模块失效、状态清理）
- CLI 工具重启成本极低（秒级）
- 与 Claude Code 的行为一致
- 避免中途更换工具导致 LLM 困惑

**影响**:
- 添加/修改 skill 需要重启
- 可通过 slash command 动态 activate/deactivate 已注册的 skill

---

## ADR-5: Permission 阻塞式交互

**决策**: `beforeToolCall` 中通过 readline 同步等待用户输入，阻塞 agent loop。

**理由**:
- pi-agent-core 的 `beforeToolCall` 是 async，天然支持等待
- 用户需要看到工具参数后做出决策，无法异步
- 这是 CLI 交互的标准模式（类似 sudo 密码提示）

**影响**:
- Agent 被完全暂停直到用户响应
- 这是预期的 UX：用户看 → 判断 → 放行/拒绝

---

## ADR-6: 摘要使用独立（廉价）模型

**决策**: `summarize-prefix` 策略可配置单独的 summary model，默认使用最快最便宜的模型。

**理由**:
- 摘要是后台维护操作，不需要最强推理能力
- 用户不直接消费摘要内容（仅作 context 保持）
- 降低长对话的运营成本

**影响**:
- 摘要质量取决于廉价模型的能力
- 通过配置 `summaryModel` 允许用户权衡质量/成本
- 默认与主模型相同（如 deepseek-v4-flash），确保基线质量

---

## ADR-7: ULID 作为 ID 生成策略

**决策**: Session ID 和 Memory Entry ID 使用 ULID。

**理由**:
- 时间可排序：天然按创建时间排列，`list` 操作无需额外排序
- 碰撞概率极低：128-bit
- 可从 ID 直接读取创建时间
- 无需自增计数器或协调

**影响**:
- 需要引入 ULID 生成器（可用轻量实现，~20 行代码）
- ID 较长（26 字符），用户手动输入不便（可支持前缀匹配）

---

## ADR-8: 项目级记忆按路径 hash 隔离

**决策**: 项目记忆存储在 `~/.dscode/data/memory/projects/<sha256-prefix-12>.json`。

**理由**:
- 同一机器可能有多个项目
- 不在项目目录内创建文件（避免污染 git）
- Hash 确保路径变化时自动隔离

**影响**:
- 项目移动后记忆"丢失"（hash 变化）
- 可通过 `/memory migrate` 命令手动迁移（未来增强）
- 不同路径但相同项目（symlink）会被视为不同项目

---

## ADR-9: 层间依赖严格单向

**决策**: Layer N 只能依赖 Layer 0..N-1，禁止反向或跨层依赖。

**理由**:
- 清晰的依赖图便于独立测试和替换
- 避免循环依赖导致的初始化问题
- 各层可独立演进

**影响**:
- 某些功能需要通过 Harness 编排器间接通信
- 例：Layer 5 Permission 的 `promptUser` 需要 Layer 6 UI，通过构造时注入回调函数解决，而非直接 import

---

## ADR-10: 不引入 Framework 依赖

**决策**: UI 层使用原生 `readline` + ANSI escape codes，不引入 ink、blessed、terminal-kit 等。

**理由**:
- 保持依赖最小化（当前仅 pi-agent-core + pi-ai + tsx）
- readline 对流式输出的支持足够
- ANSI 直写性能最好，无虚拟 DOM 开销
- 大多数功能（着色、光标控制、清行）用 escape code 即可

**影响**:
- 无法做复杂 TUI（分栏、滚动面板）
- 若未来需要更丰富的 UI，可替换 Layer 6 实现
- 当前 MVP 阶段，简单 REPL 足够
