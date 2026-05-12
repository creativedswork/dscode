# 项目说明

## 名字

项目名叫 **dscode**——"ds" 是 DeepSeek 的简写，加上 "code"，简洁又不失标识性。

最初想叫 "DeepSeek Code"，但怕太官方；后来考虑 "DeepCode"，发现同名项目太多。最终取 "ds" 前缀 + "code" 后缀，定了 dscode。

之所以带 "code"，是因为编程仍然是模型在数字世界里最稳定、最可迁移的基础能力之一。dscode 以 coding 为起点，但目标不是停留在写代码，而是把这种能力延展为处理各类数字工作的通用 Agent Harness。

## 定位

市面上的 Coding Agent 琳琅满目：从早期的 GitHub Copilot、Cline、Windsurf、Cursor，到后来的 Trae、Claude Code，以及各种 CLI——Codex CLI、Gemini CLI……那为什么还需要 dscode？

虽然名字带 "code"，但 dscode 不想停留在传统 AI Coding Agent 的边界。那些 Agent 主要服务**开发者**，帮他们构建个人或企业项目，因此你会发现它们都构建了 Explore、LSP 等代码感知的功能，即本地仓库作为主要的感知来源——**repo as the source of truth**。

dscode 的目标是成为处理**数字工作**的通用 Agent。代码仓库只是其中一种环境；浏览器、文档、设计工具、表格、自动化脚本乃至任何 MCP 应用，都可以成为 Agent 感知与执行的入口——**digital tools as the sources of truth**。

## 理念

Harness 是给模型一个探索的环境。在这个环境里，模型解决问题、获得反馈，不断适应——就像通过 RL 持续增强一样，Harness 和模型协同进化。

Claude Code 就是围绕 Claude 模型构建的 Harness。带着对 Anthropic 团队这个信念的认同，我们想让国产模型 DeepSeek 也拥有自己的 Harness。

从 Agentic Workflow 到上下文管理再到记忆系统——模型每强一分，Harness 的重心就移一寸。dscode 只做 DeepSeek 模型的 Harness，就像 Claude Code 是 Claude 模型的 Harness。



## 规划

一个技术项目的规划离不开技术本身。随着模型迭代，Harness 的功能重心会不断迁移。下面从两个核心方向谈谈后续规划。

### Agent as OS

Karpathy 最早提出 [LLM as OS](https://x.com/karpathy/status/1723140519554105733) 的概念，但仔细看他的架构图，LLM as CPU 其实更贴切——上下文是内存，Agent 的各个组成部分在 OS 里都能找到映射：

1. 上下文窗口 → 寄存器
2. 系统提示词 → 内核
3. 工具 → 设备驱动接口
4. Sub Agent → 进程
5. MCP → USB，MCP Server 是 USB 连接的外部设备
6. Skill → 程序，SKILL.md 是功能的文件描述符

Agent 就是 OS，完全可以按照操作系统的概念来建设上述各部分。

伟大的创新从来不是一蹴而就，而是基于对前人工作的总结和改进。Agent 开发也不例外，只有充分理解 OS，才能设计出好的 Agent。比如 OS 的权限模式分为内核态和用户态——内核态直接操作硬件和外部设备（如写文件），用户态需要申请权限；如今的 Agent 也有类似设计，写工具调用通常需要 Human in the Loop。再比如 OS 的进程分为 Worker、Explorer（Worker 变体）、Auditor、Scheduler；Claude Code 也有 Explorer、Evaluator、Planner 等 Sub Agent。

我们需要站在优秀的 OS 产品（比如 Unix）的肩膀上设计 Agent。

### System Prompt

System Prompt 仍然是 Harness 最重要的部分，值得单独讨论。

模型会逐渐吞掉 System Prompt 的许多功能——CoT、Workflow 等推理模式正在被模型内化，未来意图理解也可能走同样的路。dscode 的 System Prompt 因此会收敛到两个核心职责：**权限管理**和**工具使用规范**。

System Prompt 的构建应当分层、模块化。每个模块独立维护，组合成最终注入的 Prompt。这样当 Harness 进化时，各层可以独立迭代，不必整体重写。

### 连接性

Agent 与 OS 最大的区别在于：它把现有 OS 当作环境，而它的主要目标就是探索这个环境——比如用 Shell 处理 Excel 表格，或者操控 Blender。前者需要 Skill 告诉你如何调用 CLI，后者需要 MCP 启动操控应用的服务。这就是连接性。

dscode 的工作重心也会落实在连接性上，即 MCP 和 Skill 两大能力：

- **MCP**：当连接的 Server 提供的工具过多时，上下文会爆炸。这部分需要建设好 Tool Search Tool 的能力，参考 Anthropic 的 [Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)。

- **Skill**：Skill 作为 Agent 的应用，具备工具调用、MCP 连接和开启 Sub Agent 的能力。Skill 的载体是 SKILL.md，我们希望通过 md 的可配置化来构建这些能力。