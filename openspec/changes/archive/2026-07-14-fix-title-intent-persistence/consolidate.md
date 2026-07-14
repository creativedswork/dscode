## 变更综述

Session title 经历了四个阶段的迭代：从"command 前缀剥离 + 多消息更新"建立基础提取管线，到"修复冒号命令正则 + 反转提取顺序"完善候选选择，到"修复 isTitleBetter 守卫锁死"打通更新闸门，再到本次"titleIntent 持久化"修复最深层的架构缺陷——`pendingTitleHint` 在首次 `extractSessionTitle()` 调用时即被消费，导致后续 save 时 hint 为空，Pass 1 反向扫描命中注入的系统指令正文，正确的标题被反复覆盖。至此，session title 的完整生命周期（意图设置 → 提取 → 选择 → 更新）全部闭环。

## 变更时间线

- 2026-07-08: `fix-session-title-from-command` — 初版：剥离 slash command 前缀，title 不再冻结在首条消息
- 2026-07-13: `fix-session-title-extraction` — 修复：正则覆盖冒号命令，反转提取顺序为"最新优先"，过滤噪声消息
- 2026-07-14: `fix-title-update-lock` — 修复：isTitleBetter 长度守卫锁死，改为前缀截断守卫
- 2026-07-14: `fix-title-intent-persistence` — 修复：titleIntent 持久化，防止注入指令正文覆盖正确标题

## 初始设计

**问题**: 用户在 prompt box 输入 slash command（如 `/opsx:propose fix-session-title`）时，session title 显示原始命令文本，无法区分不同 session。且 title 永远冻结在第一条消息。

**方案**: 
- 剥离 slash-command 前缀，提取有意义的内容作为 title
- 在积累更多消息后，从最新用户消息或对话上下文中提取更好的 title
- 首选最近的非命令用户消息，或最长的实质性消息

## 变更记录

### 变更: 修复提取策略缺陷

- **触发**: `/opsx:apply` 等带冒号的命令未被正确剥离，title 仍残留 `:apply` 前缀。同时"第一条消息优先"策略导致 topic 变化后 title 不更新。
- **改动**: 
  - `SLASH_COMMAND_RE` 字符类加入 `:`，覆盖 `/opsx:apply`、`/opsx:propose` 等命令
  - 提取顺序从"first qualified"反转为"last qualified"，title 自然跟随话题演进
  - 新增噪声过滤器，跳过 "thanks"/"ok"/"好的" 等低信息量消息
  - 显式化最小长度门槛（≥10 字符）
- **影响**: `extractSessionTitle()`、`isTitleBetter()`、`SLASH_COMMAND_RE` 及相关 helper

## 修复记录

### 修复: isTitleBetter 长度守卫锁死

- **症状**: Pass 1 已正确找到最新 human message 作为 title candidate，但 `isTitleBetter()` 的 `current.length < 10` 守卫条件使得一旦 title 达到 ≥10 字符就永久锁定，后续更相关的 human message 永远无法替换早期 command argument 产生的 title。
- **根因**: `isTitleBetter` 原始实现用绝对长度阈值（≥10 字符即锁定）作为质量守卫，忽略了内容实质性变化的情况。
- **修复**: 将替换策略从"长度守卫"改为"前缀截断守卫"。唯一不更新 title 的情况是 candidate 仅是 current 的前缀截断。

### 修复: titleIntent 持久化

- **症状**: `fix-title-update-lock` 放开 `isTitleBetter` 锁定后，session title 在同一个 session 内被反复覆盖为错误值——注入的系统指令正文（如 `Enter explore mode. Think deeply...`）被当作 title。
- **根因**: `pendingTitleHint` 在第一次 `extractSessionTitle()` 调用时即被消费（置 null），而 `saveSession` 每次 agent turn 被调用多次。后续调用时 hint 已空，Pass 1 反向扫描命中注入的系统指令正文，加上 `isTitleBetter` 不再锁定，正确标题被覆盖。
- **修复**: 
  - 重命名 `pendingTitleHint` → `titleIntent`，准确反映语义
  - `titleIntent` 不再被 `extractSessionTitle` 消费，仅在 `setTitleIntent()` 调用时修改
  - 调整优先级: `titleIntent` → Pass 1 → Pass 2 → Pass 3
  - 导出函数 `setPendingTitleHint` 重命名为 `setTitleIntent`
- **影响**: `src/session/manager.ts`、`src/ui/tui-app.ts`、`src/ui/web/web-backend.ts`

## 最终状态

**问题**: `fix-title-update-lock` 放开了 `isTitleBetter` 的锁定策略，却暴露了更深层的 bug：`pendingTitleHint` 在第一次 `extractSessionTitle()` 调用时就被消费（置 null），而 `saveSession` 每次 agent turn 都会被调用多次。后续调用时 hint 已空，Pass 1 反向扫描命中注入的系统指令正文，加上 `isTitleBetter` 不再锁定，正确的标题在同一个 session 内被反复覆盖为错误值。

**方案**:
- 重命名 `pendingTitleHint` → `titleIntent`：准确反映语义——不是"临时提示"，而是"用户打开 session 的真实意图"
- `titleIntent` 不再被 `extractSessionTitle` 消费：只在 `setTitleIntent()` 调用时修改
- 调整优先级：`titleIntent` → Pass 1（真实人类消息）→ Pass 2（command argument）→ Pass 3（兜底）
- `setPendingTitleHint` 重命名为 `setTitleIntent`

**能力**: 修改 `session-title-extraction` — hint 持久化策略从"首次消费后清空"改为"仅由 setTitleIntent 修改"；新增 titleIntent 优先级。

**影响**: `src/session/manager.ts`、`src/ui/tui-app.ts`、`src/ui/web/web-backend.ts`。测试覆盖多次 save 场景和 titleIntent 持久化场景。
