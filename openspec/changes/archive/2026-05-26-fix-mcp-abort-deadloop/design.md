## Design

### Fix 1: Robust onAbort（最关键的修复）

**当前代码** (`src/mcp/client.ts:587-602`):
```typescript
const onAbort = () => {
    if (cancelled) return;
    cancelled = true;
    clearTimeout(timer);
    this.pending.delete(id);
    if (method !== "initialize") {
        this.sendNotification("notifications/cancelled", ...);  // 可能抛异常
    }
    if (httpReq) {
        httpReq.destroy();  // 可能抛异常
    }
    reject(new DOMException("The operation was aborted", "AbortError")); // 异常时永不执行
};
```

**修复方案**: 将 `reject()` 移到所有可能抛异常的操作之前，并用 try-catch 包裹后续清理操作：

```typescript
const onAbort = () => {
    if (cancelled) return;
    cancelled = true;
    clearTimeout(timer);
    this.pending.delete(id);
    // 优先 reject，确保 Promise 一定被处理
    reject(new DOMException("The operation was aborted", "AbortError"));
    // 后续清理操作 best-effort
    try {
        if (method !== "initialize") {
            this.sendNotification("notifications/cancelled", { requestId: id, reason: "Request aborted by user" });
        }
    } catch { /* best-effort */ }
    try {
        httpReq?.destroy();
    } catch { /* best-effort */ }
};
```

这样即使 `sendNotification` 或 `httpReq.destroy()` 抛异常，Promise 已经被 reject，`await` 能够正常解除。

---

### Fix 2: Agent Loop 立即终止

**问题链路**：

```
MCP tool execute() 捕获 AbortError
  → 返回 { content: "Tool call aborted by user.", terminate: undefined }
  → executePreparedToolCall 收到成功结果 (isError: false)
  → Promise.all resolve
  → agent loop 继续 → 调用 streamAssistantResponse  → 发现 signal.aborted → 终止
```

多了一次无意义的 LLM 调用（且如果 LLM provider 恰好不检查 aborted signal，loop 会继续）。

**修复方案 A（修改 pi-agent-core 库）**：在 `runLoop` 的 tool execution 之后、loop 继续之前增加 `signal.aborted` 检查：

```js
// agent-loop.js runLoop 内部，tool execution 之后
if (toolCalls.length > 0) {
    const executedToolBatch = await executeToolCalls(...);
    // ... 
    if (signal?.aborted) {
        await emit({ type: "agent_end", messages: newMessages });
        return;
    }
}
```

**修复方案 B（在 harness 层兜底）**：利用 `afterToolCall` 钩子，在 MCP 工具被 abort 后设置 `terminate: true`，这样 `shouldTerminateToolBatch` 返回 true，loop 自动跳出。

由于 `pi-agent-core` 是外部依赖，**方案 B 更可行**。在 `MCPManager.buildAgentTool` 中，AbortError catch 时设置 `terminate: true`：

```typescript
catch (err: any) {
    if (err instanceof DOMException && err.name === "AbortError") {
        return {
            content: [{ type: "text", text: "Tool call aborted by user." }],
            details: { server: serverName, tool: def.name, error: true },
            terminate: true,  // ← 关键：让 agent loop 立即终止
        };
    }
}
```

同时，在 `harness.afterToolCall` 中增加兜底逻辑：如果 signal 已 abort，设置 `terminate: true`。

---

### Fix 3: MCP 子进程清理

**当前行为**：abort 后子进程继续运行，成为僵尸。

**修复方案**：在 `MCPClient.close()` 和 `onAbort` 中增加进程终止逻辑。

```typescript
// MCPClient 新增方法
private killProcess(): void {
    if (!this.process || this.process.killed) return;
    try {
        this.process.kill('SIGTERM');
        // 给 2 秒优雅退出时间
        setTimeout(() => {
            if (this.process && !this.process.killed) {
                try { this.process.kill('SIGKILL'); } catch {}
            }
        }, 2000);
    } catch {}
}
```

`onAbort` 中，对于 stdio transport，调用 `this.killProcess()`：

```typescript
// onAbort 中，reject() 之后
try {
    if (this.resolvedTransport === "stdio") {
        this.killProcess();
    }
} catch { /* best-effort */ }
```

**注意**：kill 仅针对因工具卡死而 abort 的场景。正常 `close()` 已经走 `closeStdioGracefully()` 路径。abort 场景下进程已不可恢复，直接 kill 更合适。
