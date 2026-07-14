## 变更综述

Session title 经历了三个阶段的迭代：从最初的"command 前缀剥离 + 多消息更新"建立基础提取管线，到"修复冒号命令正则 + 反转提取顺序 + 噪声过滤"完善候选选择策略，再到本次"修复 isTitleBetter 守卫锁死"打通最后一道闸门。至此，session title 的完整生命周期（提取 → 选择 → 更新）全部闭环：title 始终反映最近的实质性用户消息，只在候选是当前 title 的前缀截断时保持稳定。

## 变更时间线

- 2026-07-08: `fix-session-title-from-command` — 初版：剥离 slash command 前缀，title 不再冻结在首条消息
- 2026-07-13: `fix-session-title-extraction` — 修复：正则覆盖冒号命令，反转提取顺序为"最新优先"，过滤噪声消息
- 2026-07-14: `fix-title-update-lock` — 修复：isTitleBetter 长度守卫锁死，改为前缀截断守卫

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

- **症状**: Pass 1 已正确找到最新 human message 作为 title candidate，但 `isTitleBetter()` 的 `current.length < 10` 守卫条件使得一旦 title 达到 ≥10 字符就永久锁定，后续更相关的 human message 永远无法替换早期 command argument 产生的 title。Session 00MRKC4F 为典型案例。
- **根因**: `isTitleBetter` 原始实现用绝对长度阈值（≥10 字符即锁定）作为质量守卫，忽略了内容实质性变化的情况。
- **修复**: 将替换策略从"长度守卫"改为"前缀截断守卫"：
  ```typescript
  function isTitleBetter(current: string, candidate: string): boolean {
    if (!current || current === "New session") return true;
    // candidate 是 current 的截断版本 → 保留更长旧 title
    if (candidate.length < current.length && current.startsWith(candidate)) return false;
    return true;
  }
  ```
  唯一不更新 title 的情况是 candidate 仅是 current 的前缀截断（如 "Debug session" 不应替换 "Debug session manager title extraction logic"），其他情况一律信任 extractSessionTitle 的判断。

## 最终状态

**问题**: `extractSessionTitle()` 的 Pass 1 已能正确找到最新 human message 作为 title candidate，但 `isTitleBetter()` 的守卫逻辑过于严格 — title 一旦被设为 ≥10 字符就永久锁定。

**方案**:
- 修复 `isTitleBetter`: 放宽替换条件，允许 title 在 candidate 内容实质性变化时更新
- 保留降级规则: 唯一不替换的情况是 candidate 是 current 的截断版本（前缀匹配且更短），此时保持更长的旧 title

**能力**: 修改 `session-title-extraction` — `isTitleBetter` 的替换策略从"≥10 字符即永久锁定"改为"内容实质性变化时总是更新，仅前缀截断时保留旧 title"

**影响**: `src/session/manager.ts` — `isTitleBetter()` 函数。测试覆盖 topic shift 场景和前缀截断场景。
