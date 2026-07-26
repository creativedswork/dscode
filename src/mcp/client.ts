import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  MCPCancelledNotificationParams,
  MCPClientEvent,
  MCPCompatibilityMode,
  MCPInitializeResult,
  MCPLoggingMessageNotificationParams,
  MCPProgressNotificationParams,
  MCPProtocolVersion,
  MCPResourcesReadResult,
  MCPServerConfig,
  MCPToolDefinition,
  MCPToolsListResult,
  MCPTransport,
} from "./types.js";
import { DEFAULT_MCP_PROTOCOL_VERSION } from "./types.js";

const REQUEST_TIMEOUT = 30_000;
const TOOL_CALL_TIMEOUT = 120_000;

function expandTilde(p: string): string {
  if (p.startsWith("~")) {
    return join(homedir(), p.slice(1));
  }
  return p;
}

type PendingEntry = {
  method: string;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
  progressToken?: string | number;
  toolName?: string;
  timeoutMs: number;
  cleanup: () => void;
};

type HttpResponseData = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

export class MCPClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pending = new Map<string | number, PendingEntry>();
  private closed = false;
  private closing = false;
  private sseUrl: string | null = null;
  private sessionId: string | null = null;
  private protocolVersion: MCPProtocolVersion;
  private negotiatedProtocolVersion: string | null = null;
  private resolvedTransport: MCPTransport;
  private compatibilityMode: MCPCompatibilityMode = "native";
  private toolDefs = new Map<string, MCPToolDefinition>();
  private eventListeners = new Set<(event: MCPClientEvent) => void>();
  private activeSseRequest: ReturnType<typeof httpRequest> | ReturnType<typeof httpsRequest> | null = null;
  private stdioReadline: Interface | null = null;

  constructor(private config: MCPServerConfig) {
    this.protocolVersion = config.preferredProtocolVersion ?? DEFAULT_MCP_PROTOCOL_VERSION;
    this.resolvedTransport = config.transport;
  }

  getNegotiatedProtocolVersion(): string | null {
    return this.negotiatedProtocolVersion;
  }

  getResolvedTransport(): MCPTransport {
    return this.resolvedTransport;
  }

  getCompatibilityMode(): MCPCompatibilityMode {
    return this.compatibilityMode;
  }

  onEvent(listener: (event: MCPClientEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  async connect(): Promise<void> {
    let result: MCPInitializeResult;

    if (this.config.transport === "stdio") {
      this.resolvedTransport = "stdio";
      await this.connectStdio();
      result = await this.request("initialize", {
        protocolVersion: this.protocolVersion,
        capabilities: {
          extensions: {
            "io.modelcontextprotocol/ui": {
              mimeTypes: ["text/html;profile=mcp-app"],
            },
          },
        },
        clientInfo: { name: "dscode", version: "0.2.0" },
      }) as MCPInitializeResult;
    } else if (this.config.transport === "sse") {
      this.resolvedTransport = "sse";
      this.compatibilityMode = "legacy-sse";
      await this.connectLegacySSE();
      result = await this.request("initialize", {
        protocolVersion: this.protocolVersion,
        capabilities: {
          extensions: {
            "io.modelcontextprotocol/ui": {
              mimeTypes: ["text/html;profile=mcp-app"],
            },
          },
        },
        clientInfo: { name: "dscode", version: "0.2.0" },
      }) as MCPInitializeResult;
    } else {
      result = await this.connectPreferredHttpTransport();
    }

    const serverVersion = result?.protocolVersion;
    if (!serverVersion) {
      throw new Error(`MCP server "${this.config.name}" returned invalid initialize response`);
    }

    this.negotiatedProtocolVersion = serverVersion;
    if (!this.isSupportedProtocolVersion(serverVersion)) {
      throw new Error(`MCP server "${this.config.name}" negotiated unsupported protocol version ${serverVersion}`);
    }

    if (serverVersion !== this.protocolVersion) {
      this.compatibilityMode = this.resolvedTransport === "sse" ? "legacy-sse" : "downgraded";
    }

    this.emit({
      type: "protocol",
      serverName: this.config.name,
      protocolVersion: serverVersion,
      compatibilityMode: this.compatibilityMode,
    });

    this.sendNotification("notifications/initialized");
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    const tools: MCPToolDefinition[] = [];
    let cursor: string | undefined;

    while (true) {
      const result = await this.request("tools/list", cursor ? { cursor } : undefined) as MCPToolsListResult;
      const page = (result?.tools ?? []) as MCPToolDefinition[];
      tools.push(...page);
      cursor = result?.nextCursor;
      if (!cursor) break;
    }

    this.toolDefs.clear();
    for (const tool of tools) {
      this.toolDefs.set(tool.name, tool);
    }
    return tools;
  }

  getToolDef(name: string): MCPToolDefinition | undefined {
    return this.toolDefs.get(name);
  }

  getAllToolDefs(): MCPToolDefinition[] {
    return Array.from(this.toolDefs.values());
  }

  async callTool(name: string, args: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.request("tools/call", { name, arguments: args }, this.config.requestTimeoutMs ?? TOOL_CALL_TIMEOUT, true, signal, name);
  }

  async readResource(uri: string, signal?: AbortSignal): Promise<MCPResourcesReadResult> {
    return this.request("resources/read", { uri }, this.config.requestTimeoutMs ?? TOOL_CALL_TIMEOUT, true, signal) as Promise<MCPResourcesReadResult>;
  }

  async close(): Promise<void> {
    if (this.closed || this.closing) return;
    this.closing = true;
    this.closed = true;

    if (this.resolvedTransport === "stdio") {
      await this.closeStdioGracefully();
    } else if (this.resolvedTransport === "streamable-http") {
      await this.closeStreamableHttp();
    }

    if (this.activeSseRequest) {
      this.activeSseRequest.destroy();
      this.activeSseRequest = null;
    }

    this.stdioReadline?.close();
    this.stdioReadline = null;

    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error("MCP client closed"));
    }
    this.pending.clear();

    if (this.process) {
      this.process.removeAllListeners();
      this.process = null;
    }
  }

  private async connectPreferredHttpTransport(): Promise<MCPInitializeResult> {
    try {
      const result = await this.connectStreamableHttp();
      this.resolvedTransport = "streamable-http";
      this.compatibilityMode = "native";
      this.emit({
        type: "transport",
        serverName: this.config.name,
        transport: this.resolvedTransport,
        compatibilityMode: this.compatibilityMode,
      });
      return result;
    } catch (error) {
      if (!this.config.allowLegacySseFallback) {
        throw error;
      }
      this.resolvedTransport = "sse";
      this.compatibilityMode = "legacy-sse";
      await this.connectLegacySSE();
      this.emit({
        type: "transport",
        serverName: this.config.name,
        transport: this.resolvedTransport,
        compatibilityMode: this.compatibilityMode,
      });
      return await this.request("initialize", {
        protocolVersion: this.protocolVersion,
        capabilities: {
          extensions: {
            "io.modelcontextprotocol/ui": {
              mimeTypes: ["text/html;profile=mcp-app"],
            },
          },
        },
        clientInfo: { name: "dscode", version: "0.2.0" },
      }) as MCPInitializeResult;
    }
  }

  private async connectStdio(): Promise<void> {
    const rawCmd = this.config.command;
    if (!rawCmd) throw new Error(`MCP server "${this.config.name}" has no command`);
    const cmd = expandTilde(rawCmd);
    const expandedArgs = (this.config.args ?? []).map(expandTilde);
    this.process = spawn(cmd, expandedArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.config.env },
      detached: process.platform !== "win32",
    });

    this.process.stdin!.on("error", () => {});

    let stderrBuf = "";
    this.process.stderr!.on("data", (data: Buffer) => {
      stderrBuf += data.toString();
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const rejectWithStderr = (msg: string) => {
        setImmediate(() => {
          const stderr = stderrBuf.trim().slice(0, 500);
          const detail = stderr ? `: ${stderr}` : "";
          reject(new Error(`${msg}${detail}`));
        });
      };

      const onClose = (code: number | null) => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectWithStderr(`MCP server "${this.config.name}" exited with code ${code}`);
      };
      const onError = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectWithStderr(`MCP server "${this.config.name}" error: ${err.message}`);
      };
      const cleanup = () => {
        this.process?.removeListener("close", onClose);
        this.process?.removeListener("error", onError);
      };

      if (this.process!.exitCode !== null || this.process!.killed) {
        rejectWithStderr(`MCP server "${this.config.name}" exited with code ${this.process!.exitCode}`);
        return;
      }

      this.process!.on("close", onClose);
      this.process!.on("error", onError);

      setImmediate(() => {
        if (settled) return;
        cleanup();
        if (this.process!.exitCode !== null) {
          rejectWithStderr(`MCP server "${this.config.name}" exited with code ${this.process!.exitCode}`);
        } else {
          resolve();
        }
      });
    });

    this.stdioReadline = createInterface({ input: this.process.stdout! });
    this.stdioReadline.on("line", (line) => {
      this.handleMessage(line);
    });

    this.process.on("exit", (code) => {
      if (this.closing) return;
      if (!this.closed) {
        this.closed = true;
        this.emit({ type: "disconnected", serverName: this.config.name, reason: `MCP server "${this.config.name}" exited with code ${code}` });
        setImmediate(() => {
          const stderr = stderrBuf.trim().slice(0, 500);
          const detail = stderr ? `: ${stderr}` : "";
          this.rejectAllPending(new Error(`MCP server "${this.config.name}" exited with code ${code}${detail}`));
        });
      }
    });

    this.process.on("error", (err) => {
      if (this.closing) return;
      if (!this.closed) {
        this.closed = true;
        this.emit({ type: "disconnected", serverName: this.config.name, reason: `MCP server "${this.config.name}" error: ${err.message}` });
        this.rejectAllPending(new Error(`MCP server "${this.config.name}" error: ${err.message}`));
      }
    });
    this.process.on("error", (err) => {
      if (this.closing) return;
      if (!this.closed) {
        this.closed = true;
        this.rejectAllPending(new Error(`MCP server "${this.config.name}" error: ${err.message}`));
      }
    });
  }

  private async connectStreamableHttp(): Promise<MCPInitializeResult> {
    const url = this.config.url;
    if (!url) throw new Error(`MCP server "${this.config.name}" has no url`);

    const response = await this.sendHttpMessage(url, {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: this.protocolVersion,
        capabilities: {
          extensions: {
            "io.modelcontextprotocol/ui": {
              mimeTypes: ["text/html;profile=mcp-app"],
            },
          },
        },
        clientInfo: { name: "dscode", version: "0.2.0" },
      },
    }, true, false);

    if (response.statusCode >= 400) {
      throw new Error(`MCP server "${this.config.name}" rejected Streamable HTTP initialize with status ${response.statusCode}`);
    }

    const sessionId = this.getHeader(response.headers, "mcp-session-id");
    if (sessionId) {
      this.sessionId = sessionId;
    }

    const parsed = this.parseJsonResponse(response.body);
    if (!parsed?.result || typeof parsed.result !== "object") {
      throw new Error(`MCP server "${this.config.name}" returned invalid Streamable HTTP initialize response`);
    }

    this.negotiatedProtocolVersion = (parsed.result as MCPInitializeResult).protocolVersion ?? null;
    return parsed.result as MCPInitializeResult;
  }

  private async connectLegacySSE(): Promise<void> {
    const url = this.config.url;
    if (!url) throw new Error(`MCP server "${this.config.name}" has no url`);

    const parsed = new URL(url);
    const requester = parsed.protocol === "https:" ? httpsRequest : httpRequest;

    return new Promise((resolve, reject) => {
      const req = requester(
        url,
        {
          method: "GET",
          headers: { Accept: "text/event-stream", ...(this.config.headers ?? {}) },
        },
        (res) => {
          let buffer = "";
          res.on("data", (chunk: Buffer) => {
            buffer = this.handleSseChunk(buffer + chunk.toString(), (message) => {
              try {
                const data = JSON.parse(message);
                if (data.method === "endpoint") {
                  this.sseUrl = data.params?.endpoint ?? null;
                  resolve();
                } else {
                  this.handleMessage(message);
                }
              } catch {
              }
            });
          });

          res.on("end", () => {
            if (!this.closed) {
              this.closed = true;
              this.emit({ type: "disconnected", serverName: this.config.name, reason: `MCP server "${this.config.name}" SSE connection closed` });
              this.rejectAllPending(new Error(`MCP server "${this.config.name}" SSE connection closed`));
            }
          });

          res.on("error", (err) => {
            if (!this.closed) {
              this.closed = true;
              this.emit({ type: "disconnected", serverName: this.config.name, reason: `MCP server "${this.config.name}" SSE error: ${err.message}` });
              this.rejectAllPending(new Error(`MCP server "${this.config.name}" SSE error: ${err.message}`));
            } else {
              reject(new Error(`MCP server "${this.config.name}" SSE error: ${err.message}`));
            }
          });
        },
      );

      this.activeSseRequest = req;

      req.on("error", (err) => {
        reject(new Error(`MCP server "${this.config.name}" connection failed: ${err.message}`));
      });

      req.end();
    });
  }

  private async closeStdioGracefully(): Promise<void> {
    if (!this.process) return;

    try {
      this.process.stdin?.end();
    } catch {
    }

    const exited = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const timer = setTimeout(() => finish(false), 500);
      this.process?.once("exit", () => {
        clearTimeout(timer);
        finish(true);
      });
    });

    if (exited) return;

    try {
      if (process.platform !== "win32" && this.process.pid) {
        process.kill(-this.process.pid, "SIGTERM");
      } else {
        this.process.kill("SIGTERM");
      }
    } catch {
    }

    const terminated = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const timer = setTimeout(() => finish(false), 500);
      this.process?.once("exit", () => {
        clearTimeout(timer);
        finish(true);
      });
    });

    if (terminated) return;

    try {
      if (process.platform !== "win32" && this.process?.pid) {
        process.kill(-this.process.pid, "SIGKILL");
      } else {
        this.process?.kill("SIGKILL");
      }
    } catch {
    }
  }

  /**
   * Force-kill the child process for stdio transport.
   * Used when the process is stuck (e.g. infinite loop in tool execution)
   * and cannot process notifications/cancelled.
   * Sends SIGTERM first, then SIGKILL after a 2-second grace period.
   */
  private killProcess(): void {
    if (!this.process || this.process.killed) return;

    const pid = this.process.pid;
    if (!pid) return;

    try {
      if (process.platform !== "win32") {
        process.kill(-pid, "SIGTERM");
      } else {
        this.process.kill("SIGTERM");
      }
    } catch { /* best-effort */ }

    // Grace period then force kill
    setTimeout(() => {
      if (!this.process || this.process.killed) return;
      try {
        if (process.platform !== "win32" && this.process.pid) {
          process.kill(-this.process.pid, "SIGKILL");
        } else {
          this.process.kill("SIGKILL");
        }
      } catch { /* best-effort */ }
    }, 2000);
  }


  private async closeStreamableHttp(): Promise<void> {
    if (!this.config.url || !this.sessionId) return;
    const url = this.config.url;
    const sessionId = this.sessionId;
    const parsed = new URL(url);
    const requester = parsed.protocol === "https:" ? httpsRequest : httpRequest;

    await new Promise<void>((resolve) => {
      const req = requester(
        url,
        {
          method: "DELETE",
          headers: this.buildHttpHeaders({
            Accept: "application/json, text/event-stream",
            "MCP-Session-Id": sessionId,
          }, false),
        },
        () => resolve(),
      );
      req.on("error", () => resolve());
      req.end();
    });
  }

  private handleMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const entry = this.pending.get(msg.id);
      if (!entry) return;

      clearTimeout(entry.timer);
      this.pending.delete(msg.id);

      if (msg.error) {
        entry.reject(new Error(`MCP error: ${msg.error.message}`));
      } else {
        entry.resolve(msg.result);
      }
      return;
    }

    if (msg.id === undefined && msg.method) {
      this.handleNotification(msg.method, msg.params);
    }
  }

  private handleNotification(method: string, params: unknown): void {
    switch (method) {
      case "notifications/progress":
        const pp = params as MCPProgressNotificationParams;
        this.resetTimeout(pp.progressToken);
        const pending = this.pending.get(pp.progressToken);
        this.emit({ type: "progress", serverName: this.config.name, params: pp, toolName: pending?.toolName });
        return;
      case "notifications/message":
        this.emit({ type: "message", serverName: this.config.name, params: params as MCPLoggingMessageNotificationParams });
        return;
      case "notifications/cancelled":
        this.emit({ type: "cancelled", serverName: this.config.name, params: params as MCPCancelledNotificationParams });
        return;
      case "notifications/tools/list_changed":
        this.emit({ type: "tools_list_changed", serverName: this.config.name });
        return;
      case "notifications/resources/list_changed":
        this.emit({ type: "resources_list_changed", serverName: this.config.name });
        return;
      default:
        return;
    }
  }

  private request(method: string, params?: unknown, timeout = this.config.requestTimeoutMs ?? REQUEST_TIMEOUT, withProgress = false, signal?: AbortSignal, toolName?: string): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error(`MCP request "${method}" rejected: client closed`));
    }

    // Early-exit: signal already aborted
    if (signal?.aborted) {
      return Promise.reject(new DOMException("The operation was aborted", "AbortError"));
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const finalParams = this.attachProgressToken(params, withProgress ? id : undefined);

      let cancelled = false;

      const onAbort = () => {
        if (cancelled) return;
        cancelled = true;
        clearTimeout(timer);
        this.pending.delete(id);

        // Always reject first — guarantee Promise settlement
        reject(new DOMException("The operation was aborted", "AbortError"));

        // Best-effort cleanup: must not prevent reject()
        try {
          if (method !== "initialize") {
            this.sendNotification("notifications/cancelled", { requestId: id, reason: "Request aborted by user" });
          }
        } catch { /* best-effort */ }

        try {
          httpReq?.destroy();
        } catch { /* best-effort */ }

        // Kill stuck child process for stdio transport
        if (this.resolvedTransport === "stdio") {
          this.killProcess();
        }
      };

      signal?.addEventListener("abort", onAbort, { once: true });

      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
      };

      const entry: PendingEntry = {
        resolve: (v) => { cleanup(); resolve(v); },
        reject: (err) => { cleanup(); reject(err); },
        timer: undefined!,
        method,
        progressToken: withProgress ? id : undefined,
        toolName,
        timeoutMs: timeout,
        cleanup,
      };

      const timer = setTimeout(() => {
        cleanup();
        this.pending.delete(id);
        if (method !== "initialize") {
          this.sendNotification("notifications/cancelled", { requestId: id, reason: `Request timed out after ${timeout}ms` });
        }
        reject(new Error(`MCP request "${method}" timed out after ${timeout}ms`));
      }, timeout);
      entry.timer = timer;

      this.pending.set(id, entry);

      let httpReq: ReturnType<typeof httpRequest> | ReturnType<typeof httpsRequest> | null = null;

      if (this.resolvedTransport === "stdio") {
        this.process?.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params: finalParams }) + "\n");
        return;
      }

      if (this.resolvedTransport === "streamable-http") {
        this.sendHttpWithSessionRecovery(this.config.url!, { jsonrpc: "2.0", id, method, params: finalParams }, id)
          .then((response) => {
            const entry = this.pending.get(id);
            if (!entry) return;

            if (response.statusCode >= 400) {
              cleanup();
              clearTimeout(entry.timer);
              this.pending.delete(id);
              reject(new Error(`MCP HTTP response for "${method}" failed with status ${response.statusCode}`));
              return;
            }

            if (this.isSseResponse(response.headers)) {
              if (this.pending.has(id)) {
                cleanup();
                clearTimeout(entry.timer);
                this.pending.delete(id);
                reject(new Error(`MCP HTTP SSE response for "${method}" ended without a JSON-RPC result`));
              }
              return;
            }

            const parsed = this.parseJsonResponse(response.body);
            if (!parsed) {
              cleanup();
              clearTimeout(entry.timer);
              this.pending.delete(id);
              reject(new Error(`MCP HTTP response for "${method}" was not valid JSON-RPC`));
              return;
            }
            this.handleMessage(JSON.stringify(parsed));
          })
          .catch((err) => {
            const entry = this.pending.get(id);
            if (!entry) return;
            cleanup();
            clearTimeout(entry.timer);
            this.pending.delete(id);
            reject(new Error(`MCP HTTP error: ${err.message}`));
          });
        return;
      }

      if (this.sseUrl) {
        const parsed = new URL(this.sseUrl, this.config.url);
        const requester = parsed.protocol === "https:" ? httpsRequest : httpRequest;
        const body = JSON.stringify({ jsonrpc: "2.0", id, method, params: finalParams });

        httpReq = requester(
          parsed.toString(),
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(this.config.headers ?? {}) },
          },
          () => {
          },
        );
        httpReq.on("error", (err) => {
          const entry = this.pending.get(id);
          if (entry) {
            cleanup();
            clearTimeout(entry.timer);
            this.pending.delete(id);
            reject(new Error(`MCP SSE POST error: ${err.message}`));
          }
        });
        httpReq.write(body);
        httpReq.end();
      }
    });
  }

  private resetTimeout(id: string | number): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.cleanup();
    entry.timer = setTimeout(() => {
      this.pending.delete(id);
      entry.cleanup();
      if (entry.method !== "initialize") {
        this.sendNotification("notifications/cancelled", {
          requestId: id,
          reason: `Request timed out after ${entry.timeoutMs}ms of inactivity`,
        });
      }
      entry.reject(new Error(`MCP request "${entry.method}" timed out after ${entry.timeoutMs}ms`));
    }, entry.timeoutMs);
  }

  private sendNotification(method: string, params?: unknown): void {
    if (this.closed) return;

    const msg = JSON.stringify({ jsonrpc: "2.0", method, params });

    if (this.resolvedTransport === "stdio") {
      this.process?.stdin?.write(msg + "\n");
      return;
    }

    if (this.resolvedTransport === "streamable-http") {
      this.sendHttpMessage(this.config.url!, { jsonrpc: "2.0", method, params }, false, true).catch(() => {});
      return;
    }

    if (this.sseUrl) {
      const parsed = new URL(this.sseUrl, this.config.url);
      const requester = parsed.protocol === "https:" ? httpsRequest : httpRequest;
      const req = requester(
        parsed.toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(this.config.headers ?? {}) },
        },
        () => {
        },
      );
      req.on("error", () => {});
      req.write(msg);
      req.end();
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }

  private emit(event: MCPClientEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private attachProgressToken(params: unknown, progressToken?: string | number): unknown {
    if (progressToken === undefined) return params;
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      return {
        _meta: { progressToken },
      };
    }

    const meta = (params as Record<string, unknown>)._meta;
    return {
      ...(params as Record<string, unknown>),
      _meta: {
        ...(meta && typeof meta === "object" && !Array.isArray(meta) ? meta as Record<string, unknown> : {}),
        progressToken,
      },
    };
  }

  private isSupportedProtocolVersion(version: string): version is MCPProtocolVersion {
    return version === "2024-11-05" || version === "2025-03-26" || version === "2025-11-25";
  }

  private parseJsonResponse(body: string): any {
    if (!body) return null;
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  private handleSseChunk(buffer: string, onMessage: (message: string) => void): string {
    const normalized = buffer.replace(/\r\n/g, "\n");
    const events = normalized.split("\n\n");
    const remainder = events.pop() ?? "";

    for (const rawEvent of events) {
      const dataLines = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart());
      if (dataLines.length === 0) continue;
      onMessage(dataLines.join("\n"));
    }

    return remainder;
  }

  private isSseResponse(headers: Record<string, string | string[] | undefined>): boolean {
    const contentType = this.getHeader(headers, "content-type") ?? "";
    return contentType.toLowerCase().includes("text/event-stream");
  }

  private getHeader(headers: Record<string, string | string[] | undefined>, key: string): string | null {
    const value = headers[key] ?? headers[key.toLowerCase()];
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }

  private buildHttpHeaders(extra: Record<string, string>, includeContentType: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      ...(this.config.headers ?? {}),
      ...extra,
    };

    if (includeContentType) {
      headers["Content-Type"] = "application/json";
    }

    headers.Accept ??= "application/json, text/event-stream";
    headers["MCP-Protocol-Version"] = this.negotiatedProtocolVersion ?? this.protocolVersion;
    if (this.sessionId) {
      headers["MCP-Session-Id"] = this.sessionId;
    }
    return headers;
  }


  private async sendHttpWithSessionRecovery(url: string, payload: any, id: string | number): Promise<HttpResponseData> {
    const response = await this.sendHttpMessage(url, payload, true, true);

    // Handle session rotation: update sessionId from response
    const newSessionId = this.getHeader(response.headers, "mcp-session-id");
    if (newSessionId && newSessionId !== this.sessionId) {
      this.sessionId = newSessionId;
    }

    // Check for session expiry: 404/410 without Mcp-Session-Id header
    const isSessionExpired = (response.statusCode === 404 || response.statusCode === 410) &&
      !this.getHeader(response.headers, "mcp-session-id");

    if (isSessionExpired && !this.closed) {
      // Transparent session recovery: re-initialize and retry once
      try {
        await this.connectStreamableHttp();
        const retryResponse = await this.sendHttpMessage(url, payload, true, true);
        // Handle session rotation on retry
        const retrySessionId = this.getHeader(retryResponse.headers, "mcp-session-id");
        if (retrySessionId) {
          this.sessionId = retrySessionId;
        }
        return retryResponse;
      } catch (reinitErr: any) {
        // Re-initialize itself failed — emit disconnected
        this.closed = true;
        this.emit({ type: "disconnected", serverName: this.config.name, reason: `MCP session recovery failed: ${reinitErr.message}` });
        throw reinitErr;
      }
    }

    return response;
  }

  private async sendHttpMessage(url: string, payload: unknown, isRequest: boolean, includeContentType: boolean): Promise<HttpResponseData> {
    const parsed = new URL(url);
    const requester = parsed.protocol === "https:" ? httpsRequest : httpRequest;
    const body = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
      const req = requester(
        url,
        {
          method: "POST",
          headers: this.buildHttpHeaders({
            Accept: isRequest ? "application/json, text/event-stream" : "application/json, text/event-stream",
          }, includeContentType),
        },
        (res) => {
          const headers = res.headers as Record<string, string | string[] | undefined>;
          let responseBody = "";
          let sseBuffer = "";
          const sseResponse = this.isSseResponse(headers);

          res.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            responseBody += text;
            if (sseResponse) {
              sseBuffer = this.handleSseChunk(sseBuffer + text, (message) => this.handleMessage(message));
            }
          });
          res.on("end", () => {
            if (sseResponse && sseBuffer.trim()) {
              this.handleSseChunk(sseBuffer + "\n\n", (message) => this.handleMessage(message));
            }
            resolve({
              statusCode: res.statusCode ?? 0,
              headers,
              body: responseBody,
            });
          });
          res.on("error", (err) => reject(err));
        },
      );

      req.on("error", (err) => reject(err));
      req.write(body);
      req.end();
    });
  }
}
