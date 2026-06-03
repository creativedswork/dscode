## Context

dscode 的 session 系统（`src/session/store.ts` + `src/session/manager.ts`）当前仅支持 session 的持久化存储和列表查询。用户交互通过 slash command 系统（`src/ui/commands.ts`）完成，context 由 `SlashCommandContext`（`{ harness: HarnessAPI, ui: UiBackend }`）提供。

本次设计引入一个新的 `/eval` slash command 和独立的 session 分析引擎，对现有系统影响最小：仅在 `SessionStore` 和 `SessionManager` 上新增只读方法，不改变任何 session 数据的写路径。

## Goals / Non-Goals

**Goals:**
- `/eval <session_id>` 分析指定 session 并生成 HTML 诊断 dashboard
- `/eval`（无参数）分析当前 session
- Dashboard 生成到 `~/.dscode/eval/` 并自动打开浏览器
- 分析维度：元数据统计、工具调用分析、Phase 自动划分、关键词偏离检测、根因推断、改进建议
- 支持 session_id 前缀模糊匹配（至少 8 位）

**Non-Goals:**
- 不提供实时监控
- 不修改 session 数据（只读分析）
- Dashboard 不持久化到 session 元数据（独立存储）
- 不需要外部 JS/CSS 依赖（纯 HTML + inline CSS）
- 不做交互式 dashboard（无 JavaScript）

## Decisions

### 1. 分析引擎独立模块：`src/eval/`

**选择**: 新建独立目录 `src/eval/`，作为评测体系的顶层模块，包含所有分析逻辑和 HTML 生成。区别于 `src/session/`（session 管理），eval 是独立的对话质量评测体系。

**替代方案**: 将分析逻辑分散到 `commands.ts` 中。拒绝原因：分析逻辑复杂，commands.ts 已经很大，拆分保持职责单一。

### 2. 分析架构：规则预处理 + LLM 深度分析（混合架构）

**选择**: 采用两层混合架构。Layer 1 为本地规则引擎，负责元数据提取、工具调用统计、错误率计算以及 Session Abstract 压缩。Layer 2 为 LLM 分析，将压缩后的 session abstract 发送给 LLM，由 LLM 完成 Phase 划分、偏离检测、根因推断和改进建议生成。

```
SerializedSession (8MB JSON)
       |
       v
+--------------------------------+
|  Layer 1: 规则引擎 (本地)       |
|  +-- 元数据提取                 |
|  +-- 工具调用统计               |
|  +-- 错误率计算                 |
|  +-- Session Abstract 压缩      |  --> 输出 ~3000 tokens
+----------------+---------------+
                 |
                 v
+--------------------------------+
|  Layer 2: LLM 分析              |
|  +-- Phase 划分 + 因果标注      |
|  +-- 偏离检测 (语义理解)         |
|  +-- 根因推断 (发现未知模式)     |
|  +-- 改进建议生成               |
+----------------+---------------+
                 |
                 v
           EvalResult (JSON)
```

**替代方案**: 纯规则引擎（regex + Jaccard 距离）。拒绝原因：规则引擎只能识别已知 pattern，英文 thinking 模板耦合，中文语义理解弱。混合架构中规则引擎退化为"预处理器"角色，LLM 承担核心分析。

**LLM 调用的优势**：
- Phase 划分：理解语义而非匹配"Let me create"模板，中英文通用
- 偏离检测：理解"用户目标"与"截图描述"之间的语义距离，而非关键词集合交集
- 根因推断：能发现任意反模式（效果过载、感知盲区、scope creep、fix cascade...），而非仅硬编码的 2 种
- 改进建议：自然语言生成，具体可操作，而非通用模板

**LLM 调用方式**: 复用 dscode 自身的 `ctx.harness` 完成一次 one-shot 分析调用，不需要额外 API key 或模型配置。

### 3. Session Compactor 预处理压缩策略

**选择**: 在发送给 LLM 之前，规则引擎将原始 session JSON 压缩为结构化的 Session Abstract。每条消息压缩为 `CompactMessage`：

| 保留 | 丢弃 |
|------|------|
| 用户消息全文（通常很短） | assistant 长回复的中间段落 |
| assistant thinking 首 200 字 | 重复的错误重试日志 |
| 所有截图/视觉描述（关键信号！） | 工具调用的完整参数 JSON |
| 工具名 + 创建的关键对象名 | 文件读取的完整内容 |
| 错误信息 | 成功的冗余操作 |
| 用户情绪标记（frustrated/confused） | |

```typescript
interface CompactMessage {
  idx: number;                        // M72
  role: "user" | "assistant";
  intent?: string;                    // "创建 FakeReflections 组件"
  toolsCalled?: string[];             // ["execute_blender_code"]
  screenshotDesc?: string;            // "描述：画面出现云状纹理..."
  error?: string;                     // "Material node not found"
  userEmotion?: "neutral" | "frustrated" | "confused";
  keyQuote?: string;                  // 用户原文关键句
}
```

目标：将 8MB JSON 压缩至 ~3000 tokens，同时保留所有分析所需的关键信号。

### 4. LLM 分析 Prompt 设计

**选择**: 使用结构化 System Prompt + 压缩后的 Session Abstract 作为 User Message，要求 LLM 输出严格 JSON。

**System Prompt 核心要点**：
- **角色定义**：`You are a session quality auditor for an AI coding agent. Your job is to analyze a compressed conversation log and produce a structured diagnostic report.`
- **分析维度**：Phase 划分、偏离检测、根因推断、改进建议、整体评分
- **偏离定义**：截图描述中的视觉元素与用户目标矛盾或不匹配；assistant thinking 显示对目标的理解偏差；assistant 添加了未被请求的复杂度
- **根因模式提示**：效果过载（同时启用多个重叠机制）、感知盲区（截图显示异常但 assistant 未识别）、scope creep（添加未请求的功能）、fix cascade（一个修复引发另一个问题）
- **输出约束**：必须输出合法 JSON 匹配指定 schema，不得包含 markdown 代码块标记或解释文本，所有 messageIdx 必须引用压缩日志中的实际索引
- **语言要求**：改进建议使用中文

**User Message（压缩后 Session Abstract）结构**：
```
SESSION METADATA
────────────────
ID: 00MPX37L8RW7I64DNM725JX5MK
Title: 湿地面反射实时预览
Model: claude-sonnet-4-20250514
Duration: 2h 15min | 115 messages

═══════════════════════════════════════
COMPRESSED SESSION LOG
═══════════════════════════════════════

M0 [user]:
"我想做一个湿地面的实时反射效果..."

M1-M6 [assistant]: 探索阶段
thinking: "Let me understand what the user wants..."
tools: read_file(3), execute_blender_code(2)
errors: 2次 API 兼容性问题 -> 修复

M72 [assistant]: ★ 关键转折
thinking: "Let me add some more visual effects..."
tools: execute_blender_code(3)
created: FakeReflections(alpha=0.35), WaterPuddleOverlay(
         noise_scale=6.0, z_offset=0.001)

M73 [assistant]: 截图验证
screenshot: "描述：画面出现大面积云状纹理覆盖在地面上..."
thinking: "The texture looks more detailed now, seems good"
⚠ 偏离信号!

M89 [user]:
"不对不对，这完全是云层了！..."
😤 用户投诉

═══════════════════════════════════════
TOOL USAGE SUMMARY
═══════════════════════════════════════
Total: 52 | Errors: 10 (19.2%)
execute_blender_code: 35 | get_screenshot: 8
```

**成本估算**（Claude Sonnet）：
- Input: ~3000 tokens / Output: ~800 tokens
- 单次分析: ~$0.015，延迟 3-5 秒

### 5. 降级策略：LLM 不可用时回退规则引擎

**选择**: 当 LLM 调用失败（网络错误、配额耗尽、超时、JSON parse 失败重试后仍无效）时，自动回退到纯规则引擎分析。规则引擎使用 regex Phase 划分 + Jaccard 偏离检测。Dashboard 顶部标注"规则引擎分析（LLM 不可用）"。

```
/eval session_id
      |
      v
Layer 1 (规则引擎) --> 始终执行
      |
      v
LLM 可用? --Yes--> Layer 2 (LLM 分析) --> 完整报告
      |
      No
      |
      v
规则引擎降级分析 --> 基础报告 (标注"LLM 不可用")
```

### 6. Dashboard 输出：纯静态 HTML

**选择**: 生成纯 HTML + inline CSS 的静态文件，暗色主题，无 JavaScript。

**替代方案**: React/Vue 组件或引入 Chart.js 等图表库。拒绝原因：目标是快速诊断，静态 HTML 可通过浏览器打开无需 server；暗色主题与 dscode TUI 风格一致。

### 7. Session 数据访问：新增公开方法而非直接读文件

**选择**: 在 `SessionStore` 新增 `loadSessionFile(id): Promise<SerializedSession | null>` 公开方法，在 `SessionManager` 新增 `getSessionFilePath(idOrPrefix)` 方法。

**替代方案**: 在 eval 模块中直接 `fs.readFile` 拼接路径。拒绝原因：绕过 SessionStore 会破坏封装，且无法利用已有的 session 目录扫描逻辑。

### 8. 跨平台浏览器打开

**选择**: 使用 `child_process.exec` + 平台检测：macOS `open`，Linux `xdg-open`，Windows `start`。

**替代方案**: 使用 `open` npm 包。拒绝原因：避免引入外部依赖，`child_process.exec` 已足够。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| Phase 划分不准确（规则引擎降级场景） | LLM 分析路线下语义理解能力强；降级时多重信号组合，低 confidence phase 标记 `?` |
| LLM 输出 JSON 格式不稳定 | System Prompt 强约束 + JSON parse 失败时 retry 一次 + 最终降级回退规则引擎 |
| LLM 调用延迟（3-5s） | 显示进度提示"正在分析 session..."；规则引擎统计部分立即可用 |
| 大型 session 超过 LLM context window | Compactor 严格限制 ~3000 tokens；极端情况做二次截断并在 dashboard 标注 |
| Session Abstract 压缩丢失关键信号 | Compactor 保留策略以"截图描述 + 用户消息 + 错误信息"为最高优先级；LLM 分析结果标注 confidence |
| HTML 注入风险 | 所有用户输入文本严格 HTML-escape |
| 跨平台 open 命令兼容性 | macOS/Linux/Windows 三平台覆盖，失败时仅打印路径不报错 |
| LLM 成本（~$0.015/次） | 可接受；未来可加 `/eval --local` flag 强制使用规则引擎跳过 LLM 调用 |
