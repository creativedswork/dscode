# MCP 2025-11-25 规范兼容性审查说明

基于 MCP 最新规范 `2025-11-25`（<https://modelcontextprotocol.io/specification/2025-11-25>）对当前仓库的 MCP 实现进行了审查。

结论：**当前实现仍主要停留在 `2024-11-05` 协议语义与旧版 HTTP+SSE 传输模型上，基础能力可用，但与 2025-11-25 规范存在较明确的兼容性缺口。** 若目标是兼容更多新 MCP Server、对齐最新 SDK/规范、减少互操作问题，建议分阶段升级。

---

## 1. 审查范围

重点审查了以下实现：

- `src/mcp/client.ts`
- `src/mcp/manager.ts`
- `src/mcp/types.ts`
- `src/core/config.ts`
- `src/mcp/app/host.ts`
- `src/mcp/app/types.ts`

当前 MCP 实现的主要特点：

- 初始化时固定发送 `protocolVersion: "2024-11-05"`
- 远端 HTTP 连接使用旧版 **HTTP+SSE** 模型
- 已实现的 server feature 较少，主要只有：
  - `tools/list`
  - `tools/call`
  - `resources/read`
- 未覆盖或未处理的能力较多，包括：
  - `resources/list`
  - `resources/templates/list`
  - `resources/subscribe`
  - `prompts/list`
  - `prompts/get`
  - `completion/complete`
  - `logging/setLevel`
  - `notifications/message`
  - `notifications/*/list_changed`
  - `notifications/progress`
  - `notifications/cancelled`
  - `roots/list`
  - sampling / elicitation / tasks

---

## 2. 总体结论

### 结论摘要

当前实现**不是完全不兼容**，但它是按较早期 MCP 规范设计的；对于只支持旧版协议或愿意向后兼容的 server，通常还能工作；但对于按 `2025-11-25` 新规范实现、尤其依赖 **Streamable HTTP**、通知语义、分页、日志、进度与取消机制的 server，存在较高概率的兼容问题。

### 最重要的问题

1. **协议版本过旧**：客户端固定声明 `2024-11-05`
2. **HTTP 传输模型过时**：仍以旧版 HTTP+SSE 为主，而不是 `Streamable HTTP`
3. **未实现若干关键 utilities**：取消、进度、日志、list changed
4. **未完整消费 Tool 结果语义**：未正确处理 `isError`
5. **feature 覆盖不足**：缺少 prompts/resources discovery/completion/roots 等能力

---

## 3. 必须优先更新的项

## 3.1 协议版本仍固定为 `2024-11-05`

位置：`src/mcp/client.ts:9`

```ts
const MCP_PROTOCOL_VERSION = "2024-11-05";
```

### 问题

根据 `2025-11-25` lifecycle 规范，客户端初始化时应发送自己支持的协议版本，且通常应优先发送**最新支持版本**。当前固定发送旧版本，意味着：

- 新 server 可能只能退回兼容模式
- 也可能直接按新规范工作，导致行为不一致
- 后续 HTTP 请求中要求的 `MCP-Protocol-Version` header 也没有实现

### 建议

- 将首选协议版本升级为 `2025-11-25`
- 如需兼容旧 server，增加版本协商/fallback 逻辑

### 优先级

**P0 / 高**

---

## 3.2 HTTP 传输仍是旧版 HTTP+SSE

位置：

- `src/mcp/types.ts:28`
- `src/core/config.ts:159`
- `src/mcp/client.ts:214`

当前 transport 类型：

```ts
transport: "stdio" | "sse";
```

### 问题

`2025-11-25` 标准传输为：

- `stdio`
- `Streamable HTTP`

旧的 HTTP+SSE 已被新规范替代，仅建议作为向后兼容保留。

当前 `connectSSE()` 的逻辑是：

1. 先 `GET` 建立 SSE
2. 等待 `endpoint` 事件
3. 再向该 endpoint 发 POST

这是典型 **2024-11-05 HTTP+SSE** 模型，不是 `2025-11-25` 的 **Streamable HTTP**。

### 新规范要求

新版 `Streamable HTTP` 的关键点：

- 单一 MCP endpoint
- client -> server 消息一律走 `POST`
- `POST` 必须带 `Accept: application/json, text/event-stream`
- server 可返回：
  - 单个 `application/json`
  - 或 `text/event-stream`
- client 可额外 `GET` 同一 endpoint 建立 server -> client SSE 流
- 支持：
  - `MCP-Protocol-Version`
  - `MCP-Session-Id`
  - `Last-Event-ID`
  - 404/405/202 等语义

### 当前缺口

目前未实现：

- Streamable HTTP 的 `POST initialize`
- 单 endpoint 模式
- `MCP-Protocol-Version` header
- `MCP-Session-Id` 的保存和复用
- session 失效后的重建
- `Last-Event-ID` 恢复能力
- GET stream / POST stream 的规范区分

### 建议

- 将 transport 抽象升级为：
  - `"stdio"`
  - `"streamable-http"`
  - 可选 `"sse"`（legacy fallback）
- 优先尝试 `Streamable HTTP`
- 当遇到兼容性失败时，再回退到 legacy HTTP+SSE
- 不再将 `url` 默认推断为 `sse`

### 优先级

**P0 / 最高**

---

## 3.3 HTTP 请求头未按新规范发送

位置：

- `src/mcp/client.ts:223`
- `src/mcp/client.ts:347`

当前 GET 请求只发：

```ts
headers: { Accept: "text/event-stream" }
```

当前 POST 请求只发：

```ts
headers: { "Content-Type": "application/json" }
```

### 问题

`Streamable HTTP` 下，规范要求：

- POST 必须包含 `Accept: application/json, text/event-stream`
- 初始化后后续 HTTP 请求必须带 `MCP-Protocol-Version`
- 若 server 返回 `MCP-Session-Id`，后续请求必须回带该 header

### 当前缺口

- 未发送 `Accept: application/json, text/event-stream`
- 未发送 `MCP-Protocol-Version`
- 未处理 `MCP-Session-Id`

### 优先级

**P0 / 高**

---

## 3.4 stdio 关闭流程不符合 lifecycle 建议

位置：

- `src/mcp/client.ts:85`
- `src/mcp/client.ts:279`

当前 stdio 关闭时直接 kill：

```ts
this.killProcessTree();
```

### 问题

`2025-11-25` lifecycle 对 stdio shutdown 的建议为：

1. 先关闭 server stdin
2. 等待 server 自行退出
3. 超时再发 `SIGTERM`
4. 仍不退出再发 `SIGKILL`

### 建议

将当前 stdio `close()` 改为更平滑的 graceful shutdown。

### 优先级

**P1 / 中高**

---

## 4. 建议尽快补齐的协议 utilities

## 4.1 未实现 cancellation

位置：`src/mcp/client.ts:331`

当前超时只做本地 reject，没有向 server 发取消通知。

### 规范要求

超时场景下，发送方 **SHOULD** 发送：

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/cancelled",
  "params": {
    "requestId": 123,
    "reason": "Request timeout"
  }
}
```

### 当前影响

- server 侧任务可能继续执行
- 资源浪费
- 长任务 server 兼容性较差

### 建议

- 对所有非 `initialize` 请求记录 request id
- 超时或用户中止时发送 `notifications/cancelled`
- 取消后忽略迟到响应

### 优先级

**P1 / 高**

---

## 4.2 未实现 progress

位置：`src/mcp/client.ts:315`

当前所有 notification 基本都被忽略：

```ts
if (msg.id === undefined && msg.method) {
  return;
}
```

### 规范要求

若客户端希望接收进度，应在请求参数中通过 `_meta.progressToken` 传入 token；server 可回：

- `notifications/progress`

### 当前缺口

- 请求未带 `progressToken`
- 未处理 `notifications/progress`
- 超时管理不会因 progress 更新而调整

### 影响

- 长时间 tool 调用体验较差
- server 的进度通知全部丢失

### 建议

最低限度可先实现：

1. 对长请求附加 `_meta.progressToken`
2. 在 `handleMessage()` 中识别 `notifications/progress`
3. 用于 TUI 展示或延长超时窗口

### 优先级

**P1 / 中高**

---

## 4.3 未实现 logging

位置：`src/mcp/client.ts:315`

### 规范能力

server 若声明 `logging` capability，可发送：

- `notifications/message`

client 可发送：

- `logging/setLevel`

### 当前缺口

- 完全忽略 `notifications/message`
- 没有 `logging/setLevel`

### 影响

- server 诊断日志不可见
- 初始化前允许发送的 logging 也没有被消费

### 建议

- 先实现 `notifications/message` 接收和本地展示
- 之后再补 `logging/setLevel`

### 优先级

**P1 / 中**

---

## 4.4 未实现 listChanged 通知

位置：

- `src/mcp/client.ts:315`
- `src/mcp/manager.ts:189`

当前未处理这些通知：

- `notifications/tools/list_changed`
- `notifications/resources/list_changed`
- `notifications/prompts/list_changed`
- `notifications/roots/list_changed`

### 影响

- server 端能力变更后，客户端不会刷新
- MCP browser 只能看到初始化快照

### 建议

优先补：

- `tools/list_changed` -> 重新拉取 `tools/list`

如后续支持 resources/prompts，再补其余通知。

### 优先级

**P1 / 中**

---

## 5. 功能覆盖上的缺口

## 5.1 tools 仅支持最小子集，未完整消费新字段

位置：

- `src/mcp/types.ts:43`
- `src/mcp/manager.ts:230`

当前 `MCPToolDefinition` 只识别：

- `name`
- `description`
- `inputSchema`
- `alwaysLoad`
- `_meta.ui`

### 新规范中的 Tool 字段

`2025-11-25` 中 Tool 还包含：

- `title`
- `icons`
- `outputSchema`
- `annotations`
- `execution.taskSupport`

### 影响

- UI 元信息缺失
- 不能使用 `outputSchema` 校验 `structuredContent`
- 无法识别 tool 的 task 支持情况

### 更关键的问题：未处理 `isError`

位置：`src/mcp/manager.ts:252`

当前调用工具后只提取文本和 `structuredContent`，没有消费 `isError`。

这意味着如果 server 返回：

```json
{
  "content": [...],
  "isError": true
}
```

当前逻辑仍倾向于把它当正常结果处理，而不是工具执行错误。

### 建议

- 扩展 `MCPToolDefinition` 类型
- 保留 `title/icons/outputSchema/annotations/execution`
- 在工具返回值中识别并传递 `isError`
- 在 UI / tool bridge 层面将其映射为真正的错误状态

### 优先级

**P0 / 高**

---

## 5.2 `tools/list` 未做分页

位置：`src/mcp/client.ts:59`

### 问题

当前只发一次 `tools/list`，没有处理 `cursor` / `nextCursor`。

### 影响

工具很多的 server 可能只能拿到第一页工具。

### 建议

循环调用 `tools/list`，直到没有 `nextCursor`。

### 优先级

**P1 / 中**

---

## 5.3 resources 只实现了 `read`

位置：

- `src/mcp/client.ts:81`
- `src/mcp/manager.ts:129`

### 未实现项

- `resources/list`
- `resources/templates/list`
- `resources/subscribe`
- `resources/unsubscribe`
- `notifications/resources/updated`
- `notifications/resources/list_changed`

### 影响

- 只能在“已知 URI”前提下直接读资源
- 不能发现资源
- 不能发现 resource template
- 不能跟踪资源变化

### 建议

若产品后续要更完整消费资源体系，建议补齐 `list/templates/subscription`。

### 优先级

**P2 / 中高**

---

## 5.4 完全没有 prompts 支持

仓库中未发现：

- `prompts/list`
- `prompts/get`

### 影响

- 无法消费 server 暴露的 prompt 模板
- 无法把 prompt 映射成 slash command 或 UI 入口

### 优先级

**P2 / 中**

---

## 5.5 完全没有 completions 支持

仓库中未发现：

- `completion/complete`

### 影响

- prompt 参数补全无法使用
- resource template 参数补全无法使用

### 优先级

**P2 / 中**

---

## 5.6 没有 roots / sampling / elicitation / tasks 协商

位置：`src/mcp/client.ts:39`

当前初始化 capabilities 只有 UI extension：

```ts
capabilities: {
  extensions: {
    "io.modelcontextprotocol/ui": {
      mimeTypes: ["text/html;profile=mcp-app"],
    },
  },
}
```

### 缺口

未声明：

- `roots`
- `sampling`
- `elicitation`
- `tasks`

### 影响

server 无法和客户端协商这些能力：

- `roots`：文件系统边界暴露
- `sampling`：server 发起模型采样
- `elicitation`：server 请求用户补充信息
- `tasks`：耐久请求/轮询式任务

### 建议

若产品定位包含 IDE/CLI 宿主能力，`roots` 是最值得优先评估补上的 client feature。

### 优先级

**P2 / 中**

---

## 6. 类型与数据模型层面的建议

## 6.1 transport 类型应升级

位置：

- `src/mcp/types.ts:25`
- `src/core/config.ts:156`

当前：

```ts
transport: "stdio" | "sse";
```

### 建议

建议调整为：

```ts
transport: "stdio" | "streamable-http" | "sse";
```

同时：

- `url` 默认优先按 `streamable-http` 处理
- `sse` 作为 legacy 模式保留

---

## 6.2 JSON Schema 处理过于简化

位置：`src/mcp/manager.ts:48`

当前 `convertJsonSchema()` 只做了粗粒度类型映射，忽略了：

- `required`
- `enum`
- `$schema`
- nested object
- `oneOf` / `anyOf`
- array item schema

### 规范背景

`2025-11-25` 明确使用 **JSON Schema 2020-12** 作为默认 dialect。

### 影响

复杂 tool schema 在当前宿主里的参数表达并不准确。

### 优先级

**P2 / 中**

---

## 6.3 结果内容类型支持不完整

位置：`src/mcp/manager.ts:27`

当前主要处理：

- `text`
- `image`
- `resource`

### 新规范还支持

- `audio`
- `resource_link`
- 带 annotations 的 content block

### 影响

这些类型会被弱化处理，甚至降级成字符串化 JSON。

### 优先级

**P3 / 中**

---

## 6.4 initialize implementation info 可以更完整

位置：`src/mcp/client.ts:46`

当前只发送：

```ts
clientInfo: { name: "dscode", version: "0.2.0" }
```

### 新规范支持的更多字段

- `title`
- `description`
- `icons`
- `websiteUrl`

### 结论

不是阻塞项，但可作为完善项补充。

### 优先级

**P3 / 低**

---

## 7. MCP App / UI extension 的判断

相关文件：

- `src/mcp/client.ts`
- `src/mcp/app/types.ts`
- `src/mcp/app/host.ts`

仓库当前实现了 `io.modelcontextprotocol/ui` 扩展，用于 `mcp-app` 类 UI 资源的承载。这个扩展本身不构成与主协议的明显冲突。

### 判断

问题的重点不在 UI extension 本身，而在于：

- 底层 MCP client 仍基于旧版协议/旧版 HTTP 传输模型
- 因此即使内部 UI 方案可工作，也不代表对第三方新 MCP server 兼容良好

---

## 8. 建议的升级优先级

## P0：建议立即处理

1. 将协议版本升级到 `2025-11-25`
2. 实现 `streamable-http` 传输
3. 为 HTTP 请求补齐必要 headers：
   - `Accept: application/json, text/event-stream`
   - `MCP-Protocol-Version`
   - `MCP-Session-Id`
4. 保留 legacy HTTP+SSE fallback
5. 正确处理 tool result 中的 `isError`

## P1：第二批建议处理

6. 支持 `notifications/cancelled`
7. 支持 `notifications/progress`
8. 支持 `notifications/message`
9. 支持 `tools/list` 分页
10. 支持 `tools/list_changed`
11. 改善 stdio graceful shutdown

## P2：按产品需求决定

12. `resources/list`
13. `resources/templates/list`
14. `resources/subscribe`
15. `prompts/list` / `prompts/get`
16. `completion/complete`
17. `roots`
18. 更完整的 JSON Schema 适配

## P3：增强项

19. 更完整的 content type 支持
20. `icons/title/outputSchema/annotations/execution` 的完整消费
21. 更完整的 initialize implementation info
22. tasks / sampling / elicitation 等较新能力

---

## 9. 可暂缓项

如果短期目标只是“让当前内置或自控 MCP server 继续可用”，以下项可以先不作为第一批改造目标：

- OAuth / Authorization 全量支持
- OIDC discovery
- incremental scope consent
- tasks experimental
- elicitation URL mode
- sampling 中的 tool calling 扩展
- icons 的完整 UI 消费

这些是 `2025-11-25` 的重要新增，但不是当前仓库最先暴露兼容问题的点。

---

## 10. 最终结论

**当前仓库的 MCP 实现有必要更新。**

最核心的不是零散小修，而是：

1. **把远端 HTTP MCP 客户端从旧版 HTTP+SSE 迁移到新版 Streamable HTTP**
2. **补上取消、进度、日志、list changed 等基础协议 utilities**
3. **完善 tool result 与 schema 的语义消费，尤其是 `isError` 与更完整的 JSON Schema 支持**

如果只优先改最关键的代码，建议先聚焦：

- `src/mcp/client.ts`
- `src/mcp/types.ts`
- `src/core/config.ts`
- `src/mcp/manager.ts`

---

## 11. 参考规范

- MCP Specification 2025-11-25: <https://modelcontextprotocol.io/specification/2025-11-25>
- Lifecycle: <https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle>
- Transports: <https://modelcontextprotocol.io/specification/2025-11-25/basic/transports>
- Tools: <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>
- Resources: <https://modelcontextprotocol.io/specification/2025-11-25/server/resources>
- Prompts: <https://modelcontextprotocol.io/specification/2025-11-25/server/prompts>
- Completion: <https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/completion>
- Logging: <https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging>
- Progress: <https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress>
- Cancellation: <https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation>
- Changelog: <https://modelcontextprotocol.io/specification/2025-11-25/changelog>

---

## 12. 按文件拆分的改造计划

下面给出一份可执行的分批改造计划，目标是把当前实现升级为：

- **2025-11-25 优先**
- **Streamable HTTP 优先**
- **legacy HTTP+SSE 可回退**
- 保持现有 stdio 与 MCP App UI bridge 主链路稳定

### 第 1 批：协议骨架与配置升级

目标：先让类型系统、配置解析和初始化协商具备承载 `2025-11-25` 的能力。

#### 需要修改的文件

- `src/mcp/types.ts`
- `src/core/config.ts`
- `src/mcp/client.ts`
- `src/mcp/manager.ts`

#### 各文件职责与改动点

##### `src/mcp/types.ts`

- 增加协议版本相关类型，至少覆盖：
  - `2024-11-05`
  - `2025-11-25`
- 扩展 transport 类型：

```ts
transport: "stdio" | "streamable-http" | "sse"
```

- 补充 initialize、tool result、notification 的更明确类型
- 明确 tool result 结构，包含：
  - `content`
  - `structuredContent`
  - `isError`
  - `_meta`
- 为 client/server capabilities 预留更清晰的结构

##### `src/core/config.ts`

- 调整 transport 推断逻辑：
  - 有 `command` 时优先 `stdio`
  - 有 `url` 但未显式指定 transport 时，默认 `streamable-http`
  - `sse` 仅作为 legacy 显式配置或回退路径
- 为运行时配置补充承载位：
  - preferred protocol version
  - fallback 开关
  - HTTP headers
  - timeout
- 保持对旧配置格式的兼容

##### `src/mcp/client.ts`

- 将固定 `2024-11-05` 升级为首选 `2025-11-25`
- 记录服务端返回的协商版本
- 区分：
  - 初始化响应无效
  - 协议版本不兼容
- 为后续 transport 拆分做准备，避免继续把“非 stdio”统一看成 `sse`

##### `src/mcp/manager.ts`

- 扩展 server state，记录：
  - negotiated protocol version
  - transport kind
  - compatibility / fallback mode

---

### 第 2 批：传输层升级为 Streamable HTTP 优先

目标：把远端 MCP 客户端从旧版 HTTP+SSE 主路径迁移到新版 Streamable HTTP 主路径，同时保留旧 SSE 兼容回退。

#### 需要修改的文件

- `src/mcp/client.ts`
- `src/mcp/types.ts`
- `src/core/config.ts`

#### 各文件职责与改动点

##### `src/mcp/client.ts`

- 拆分 transport 责任：
  - `connectStdio()`
  - `connectStreamableHttp()`
  - `connectLegacySSE()`
- 将 request / notification 的发送逻辑按 transport 分离
- 将消息接收与 JSON-RPC 解析统一收敛到单一入口
- Streamable HTTP 中补齐：
  - `Accept: application/json, text/event-stream`
  - `MCP-Protocol-Version`
  - `MCP-Session-Id`
- 处理：
  - 非 2xx 响应
  - 非 JSON 响应
  - 提前断流
  - 空响应
- 保留旧 SSE 的 endpoint 发现逻辑，但仅在以下场景启用：
  - 配置显式指定 `sse`
  - Streamable HTTP 失败且允许 fallback
- 将 stdio 关闭流程改为：
  1. 关闭 stdin
  2. 等待退出
  3. 超时后 `SIGTERM`
  4. 必要时 `SIGKILL`

##### `src/mcp/types.ts`

- 为 HTTP transport 补充运行时状态类型：
  - session id
  - negotiated version
  - fallback mode

##### `src/core/config.ts`

- 确保配置层能表达：
  - 显式 `streamable-http`
  - 显式 `sse`
  - 是否允许自动 fallback

---

### 第 3 批：通知、错误语义和刷新机制补齐

目标：补齐 2025-11-25 下最关键但当前缺失的协议 utilities 与动态刷新逻辑。

#### 需要修改的文件

- `src/mcp/client.ts`
- `src/mcp/manager.ts`
- `src/core/harness.ts`
- `src/ui/mcp-browser.ts`
- `src/mcp/app/host.ts`

#### 各文件职责与改动点

##### `src/mcp/client.ts`

- 增加 notification 分发与订阅机制，至少支持：
  - `notifications/cancelled`
  - `notifications/progress`
  - `notifications/message`
  - `notifications/tools/list_changed`
  - `notifications/resources/list_changed`
- 对超时或显式取消的请求，发送 `notifications/cancelled`（非 `initialize`）
- 将 progress / message / list changed 作为 client event 往上抛

##### `src/mcp/manager.ts`

- 消费 client 事件：
  - 收到 `tools/list_changed` 后重新拉取工具列表
  - 收到 `resources/list_changed` 后做缓存失效或变更标记
- 在 `buildAgentTool()` 中正确处理 `isError`：
  - 不再只用抛异常判断失败
  - tool-level error 需要透传给 agent / UI
  - 保留原始正文与 `structuredContent`
- 若 driver registry 动态替换能力不足，先实现“刷新提示 + 保守更新”策略，避免重复注册导致状态错乱

##### `src/core/harness.ts`

- 将 progress / message / list changed 接入运行期展示
- 建议展示策略：
  - progress 用状态更新，不刷屏
  - message 按级别映射 info / warn / error
  - list changed 提示刷新成功或失败

##### `src/ui/mcp-browser.ts`

- 扩展 server 面板显示：
  - transport
  - negotiated version
  - compatibility mode
  - refresh 状态
  - refresh error

##### `src/mcp/app/host.ts`

- 校验 app bridge 下工具调用的结果语义：
  - JSON-RPC 成功不等于工具执行成功
  - app 端也需要看到 `isError` / `structuredContent`
- 为后续 app 内接收 progress / message 留好桥接空间

---

### 第 4 批：JSON Schema 适配升级

目标：把当前 `convertJsonSchema()` 的粗糙映射升级为可用的兼容转换层。

#### 需要修改的文件

- `src/mcp/manager.ts`
- `src/mcp/types.ts`

#### 各文件职责与改动点

##### `src/mcp/manager.ts`

- 重构 `convertJsonSchema()`，支持更多结构：
  - `required`
  - `enum`
  - `array.items`
  - 嵌套 `object.properties`
  - `additionalProperties`
  - `default`
- 对复杂或暂不支持的 schema，采取“宽松降级”而不是直接失败：
  - 优先降级到 `Type.Any`
  - 或宽松对象

##### `src/mcp/types.ts`

- 为 JSON Schema 输入定义更清晰的支持子集类型
- 为后续 `outputSchema` 的消费预留结构

---

### 第 5 批：兼容收尾与可观测性完善

目标：确保新旧 server 共存时行为稳定，并提升诊断能力。

#### 需要修改的文件

- `src/ui/mcp-browser.ts`
- `src/core/harness.ts`
- `src/mcp/manager.ts`
- `src/mcp/app/host.ts`

#### 各文件职责与改动点

##### `src/ui/mcp-browser.ts`

- 增强状态文案：
  - `connected`
  - `connected (legacy sse)`
  - `connected (protocol downgraded)`
  - `refreshing`
  - `refresh failed`

##### `src/core/harness.ts`

- 对 progress / message 做节流与分类展示
- 在初始化后提示：
  - 哪些 server 走的是 legacy 模式
  - 哪些 server 发生了协议降级

##### `src/mcp/manager.ts`

- 记录最近一次刷新时间、最近 warning/error
- 对 fallback / downgrade / schema downgrade 做低噪声提示

##### `src/mcp/app/host.ts`

- 检查 app 模式下的 tool result、message、progress 语义与主 MCP 通道保持一致

---

## 13. 测试与验证建议

### 自动化测试

建议新增或补强以下测试：

- `src/mcp/client.ts`
  - initialize 协商
  - Streamable HTTP 请求/响应
  - legacy SSE fallback
  - notification 分发
- `src/mcp/manager.ts`
  - `isError` 处理
  - `tools/list_changed` 刷新
  - schema 转换
- `src/core/config.ts`
  - transport 推断
  - 新旧配置兼容
- `src/ui/mcp-browser.ts`
  - server 状态展示

可执行命令：

- `npm run typecheck`
- `npm test`

### 集成验证

至少准备三类 MCP server 做联调：

- stdio server
- 2025-11-25 Streamable HTTP server
- 旧版 HTTP+SSE server

重点验证：

- initialize 版本协商
- 成功工具调用与 `isError: true` 的差异化处理
- progress 展示
- message 展示
- `tools/list_changed` 后的工具刷新
- 关闭会话时资源释放

### UI / App 验证

- MCP Browser 中可看到：
  - transport
  - negotiated version
  - compatibility mode
  - refresh / error 状态
- 对带 UI resource 的工具验证：
  - `structuredContent` 仍能驱动 data mode app
  - app bridge 能感知 `isError`

---

## 14. 风险与回退策略

### 风险 1：新 HTTP 与 legacy SSE 混用导致远端连接不稳定

应对：

- 保留显式 `transport: "sse"` 强制旧路径
- 新 HTTP 失败后仅在允许时回退
- 在 UI 中显示当前实际 transport

### 风险 2：`tools/list_changed` 动态刷新破坏现有 driver 生命周期

应对：

- 先定义串行刷新策略
- 若 registry 替换语义不足，先做“提示刷新”而不是直接重复注册

### 风险 3：`isError` 语义变化影响上层 agent 行为

应对：

- 保留正文与 `structuredContent`
- 明确标记 tool-level error
- 避免把 tool error 当成 transport error

### 风险 4：JSON Schema 适配增强后让参数约束更严格

应对：

- 对复杂 schema 采用宽松降级
- 避免因为 schema 复杂度让工具不可用
