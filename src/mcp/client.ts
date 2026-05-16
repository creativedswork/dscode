import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { homedir } from "node:os";

import type { MCPServerConfig, MCPToolDefinition } from "./types.js";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const REQUEST_TIMEOUT = 30_000;
const TOOL_CALL_TIMEOUT = 60_000;

function expandTilde(p: string): string {
  if (p.startsWith("~")) {
    return homedir() + p.slice(1);
  }
  return p;
}

export class MCPClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private buffer = "";
  private closed = false;
  private sseUrl: string | null = null;

  constructor(private config: MCPServerConfig) {}

  async connect(): Promise<void> {
    if (this.config.transport === "stdio") {
      await this.connectStdio();
    } else {
      await this.connectSSE();
    }

    // send initialize with MCP Apps ui extension capability
    const result = await this.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        extensions: {
          "io.modelcontextprotocol/ui": {
            mimeTypes: ["text/html;profile=mcp-app"],
          },
        },
      },
      clientInfo: { name: "dscode", version: "0.2.0" },
    }) as any;

    const serverVersion = result?.protocolVersion;
    if (!serverVersion) {
      throw new Error(`MCP server "${this.config.name}" returned invalid initialize response`);
    }

    // send initialized notification
    this.sendNotification("notifications/initialized");
  }

  private toolDefs = new Map<string, MCPToolDefinition>();

  async listTools(): Promise<MCPToolDefinition[]> {
    const result = await this.request("tools/list") as any;
    const tools = (result?.tools ?? []) as MCPToolDefinition[];
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

  async callTool(name: string, args: unknown): Promise<unknown> {
    return this.request("tools/call", { name, arguments: args }, TOOL_CALL_TIMEOUT);
  }

  async readResource(uri: string): Promise<unknown> {
    return this.request("resources/read", { uri }, TOOL_CALL_TIMEOUT);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    try {
      await this.request("shutdown", undefined, 5_000);
    } catch {
      // ignore shutdown errors
    }

    // clear pending
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error("MCP client closed"));
    }
    this.pending.clear();

    if (this.process) {
      this.process.kill();
      this.process = null;
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
    });

    // Suppress EPIPE errors on stdin when the child process exits unexpectedly
    // (e.g. during Ctrl+C shutdown). Node throws unhandled 'error' events on
    // the stdin Writable if the pipe breaks while we're writing to it.
    this.process.stdin!.on("error", () => {});

    // capture stderr for error diagnostics
    let stderrBuf = "";
    this.process.stderr!.on("data", (data: Buffer) => {
      stderrBuf += data.toString();
    });

    // wait for process to be alive, or capture immediate exit with stderr
    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const rejectWithStderr = (msg: string) => {
        // In tsx environments, 'close' can fire before 'data' events are
        // processed.  Use setImmediate to yield to the event loop so any
        // pending stderr 'data' callbacks run before we read the buffer.
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

      // if process already closed, fail fast
      if (this.process!.exitCode !== null || this.process!.killed) {
        rejectWithStderr(`MCP server "${this.config.name}" exited with code ${this.process!.exitCode}`);
        return;
      }

      this.process!.on("close", onClose);
      this.process!.on("error", onError);

      // resolve after process is alive (next tick)
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


    // now set up the line handler for ongoing communication
    const rl = createInterface({ input: this.process.stdout! });
    rl.on("line", (line) => {
      this.handleMessage(line);
    });

    // handle delayed exit after successful connect
    this.process.on("exit", (code) => {
      if (!this.closed) {
        this.closed = true;
        // stderr data may arrive slightly after 'exit' (e.g. npx writing
        // npm error logs).  Wait a tick then include any captured stderr.
        setImmediate(() => {
          const stderr = stderrBuf.trim().slice(0, 500);
          const detail = stderr ? `: ${stderr}` : "";
          this.rejectAllPending(new Error(`MCP server "${this.config.name}" exited with code ${code}${detail}`));
        });
      }
    });

    this.process.on("error", (err) => {
      if (!this.closed) {
        this.closed = true;
        this.rejectAllPending(new Error(`MCP server "${this.config.name}" error: ${err.message}`));
      }
    });
  }


  private async connectSSE(): Promise<void> {
    const url = this.config.url;
    if (!url) throw new Error(`MCP server "${this.config.name}" has no url`);

    const parsed = new URL(url);
    const requester = parsed.protocol === "https:" ? httpsRequest : httpRequest;

    return new Promise((resolve, reject) => {
      const req = requester(
        url,
        {
          method: "GET",
          headers: { Accept: "text/event-stream" },
        },
        (res) => {
          let buffer = "";
          res.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const eventMatch = line.match(/^event:\s*(.+)/);
              const dataMatch = line.match(/^data:\s*(.+)/);

              if (eventMatch && eventMatch[1] === "endpoint") {
                // wait for the next data line with the actual endpoint URL
                continue;
              }

              if (dataMatch) {
                try {
                  const data = JSON.parse(dataMatch[1]);
                  if (data.method === "endpoint") {
                    // SSE endpoint for sending messages back
                    this.sseUrl = data.params?.endpoint ?? null;
                    resolve();
                  } else {
                    this.handleMessage(dataMatch[1]);
                  }
                } catch {
                  // not JSON, skip
                }
              }
            }
          });

          res.on("end", () => {
            if (!this.closed) {
              this.closed = true;
              this.rejectAllPending(new Error(`MCP server "${this.config.name}" SSE connection closed`));
            }
          });

          res.on("error", (err) => {
            reject(new Error(`MCP server "${this.config.name}" SSE error: ${err.message}`));
          });
        },
      );

      req.on("error", (err) => {
        reject(new Error(`MCP server "${this.config.name}" connection failed: ${err.message}`));
      });

      req.end();
    });
  }

  private handleMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // ignore non-JSON messages
    }

    // response
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

    // notification
    if (msg.id === undefined && msg.method) {
      // handle notifications if needed
      return;
    }
  }

  private request(method: string, params?: unknown, timeout = REQUEST_TIMEOUT): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error(`MCP request "${method}" rejected: client closed`));
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request "${method}" timed out after ${timeout}ms`));
      }, timeout);

      this.pending.set(id, { resolve, reject, timer });

      if (this.config.transport === "stdio") {
        this.process?.stdin?.write(msg + "\n");
      } else if (this.sseUrl) {
        // POST to SSE endpoint
        const parsed = new URL(this.sseUrl, this.config.url);
        const requester = parsed.protocol === "https:" ? httpsRequest : httpRequest;
        const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });

        const req = requester(
          parsed.toString(),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
          (res) => {
            // response comes via SSE stream, handled in handleMessage
          },
        );
        req.on("error", (err) => {
          const entry = this.pending.get(id);
          if (entry) {
            clearTimeout(entry.timer);
            this.pending.delete(id);
            reject(new Error(`MCP SSE POST error: ${err.message}`));
          }
        });
        req.write(body);
        req.end();
      }
    });
  }

  private sendNotification(method: string, params?: unknown): void {
    if (this.closed) return;

    const msg = JSON.stringify({ jsonrpc: "2.0", method, params });

    if (this.config.transport === "stdio") {
      this.process?.stdin?.write(msg + "\n");
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }
}
