# DeepSeek × pi-agent-core demo

一个最小可运行的命令行 demo，演示如何用 [`@mariozechner/pi-agent-core`](https://www.npmjs.com/package/@mariozechner/pi-agent-core) 跑 DeepSeek 模型，支持流式输出与工具调用。

## 功能

- 交互式 CLI 多轮对话（REPL）
- 流式文本 + reasoning（`deepseek-v4-pro` 会看到灰色 `[thinking]` 段）
- 示例工具 `get_time`：让模型调用本地函数获取当前时间 / 指定时区时间
- `/reset` 清空对话历史；`exit` 退出

## 前置条件

- Node.js ≥ 20.6（本机以 Node 22 验证）
- 一个 DeepSeek API Key：<https://platform.deepseek.com/>

## 安装

```bash
npm install
cp .env.example .env
# 编辑 .env，把 DEEPSEEK_API_KEY 填进去
```

## 运行

```bash
npm start
```

看到 `you ›` 提示即可开始对话。例如：

```
you › 现在几点？用上海时间回答。
[tool] get_time({"timezone":"Asia/Shanghai"})
[tool result] ...
ds › 现在是 2026-04-27 01:52:31（Asia/Shanghai）。
```

## 模型选择

本仓库使用 `pi-ai` 注册表里的 DeepSeek 原生 provider。当前可用的模型 ID：

| `DEEPSEEK_MODEL`      | 说明                                               |
| --------------------- | -------------------------------------------------- |
| `deepseek-v4-flash`   | 默认，便宜、快，适合日常对话 / 工具调用。         |
| `deepseek-v4-pro`     | 支持 reasoning，会产出 `thinking` 事件流；更贵更慢。|

在 `.env` 或命令行里切换：

```bash
DEEPSEEK_MODEL=deepseek-v4-pro npm start
```

> 注：库里只有这两个 id。经典的 `deepseek-chat` / `deepseek-reasoner`
> 别名在当前版本的 pi-ai 注册表中已不再提供 —— flash/pro 是与 V3/R1
> 对应的代际产品，API endpoint 仍是 `https://api.deepseek.com`。

## 代码结构

```
src/index.ts   # 全部逻辑：加载 .env、定义工具、构造 Agent、订阅事件、REPL
package.json   # tsx 启动、tsc 类型检查
tsconfig.json  # strict + noEmit
.env.example   # DEEPSEEK_API_KEY / DEEPSEEK_MODEL 模板
```

核心片段：

```ts
import { Agent, type AgentTool } from "@mariozechner/pi-agent-core";
import { getModel, streamSimple, Type } from "@mariozechner/pi-ai";

const model = getModel("deepseek", "deepseek-v4-flash");

const agent = new Agent({
  initialState: { systemPrompt: "...", model, tools: [getTimeTool] },
  streamFn: streamSimple,
});

agent.subscribe((event) => {
  if (event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await agent.prompt("现在几点？");
```

## 脚本

```bash
npm start       # 启动 REPL
npm run typecheck  # tsc --noEmit
```

## 已知事项

- 本 demo 不做对话持久化，重启即清空。需要会话保存请看
  [`@mariozechner/pi-coding-agent`](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)。
- 首次启动若卡在读取流没有输出，通常是 API Key 无效或网络被墙 —— 看
  终端 `[error]` 提示。
