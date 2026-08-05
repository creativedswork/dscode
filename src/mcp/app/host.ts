import http from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { resolveRuntimeResource } from "../../resources/runtime.js";
import type { AppInstance, McpUiResourceCsp, McpUiResourcePermissions } from "./types.js";
import type { MCPManager } from "../manager.js";
import { generateMdxRuntimeBundle } from "../../ui/mdx/runtime-bundle.js";

function findSandboxPath(): string {
  return resolveRuntimeResource("mcp", "sandbox.html");
}

export function buildCspHeader(csp?: McpUiResourceCsp): string {
  const resourceSrc = csp?.resourceDomains?.join(" ") ?? "";
  const extraConnect = csp?.connectDomains?.join(" ") ?? "";
  // sandbox proxy must be able to connect to its own bridge API (SSE + fetch)
  const connectSrc = ["'self'", extraConnect].filter(Boolean).join(" ");
  const frameSrc = csp?.frameDomains?.join(" ") ?? "'none'";
  const baseUri = csp?.baseUriDomains?.join(" ") ?? "'self'";
  return [
    "default-src 'none'",
    `script-src 'self' 'unsafe-inline' ${resourceSrc}`,
    `style-src 'self' 'unsafe-inline' ${resourceSrc}`,
    `connect-src ${connectSrc}`,
    `img-src 'self' data: ${resourceSrc}`,
    `font-src 'self' ${resourceSrc}`,
    `media-src 'self' data: ${resourceSrc}`,
    `frame-src ${frameSrc}`,
    "object-src 'none'",
    `base-uri ${baseUri}`,
  ].join("; ").trim();
}

export function buildAllowAttr(permissions?: McpUiResourcePermissions): string {
  const list: string[] = [];
  if (permissions?.camera) list.push("camera");
  if (permissions?.microphone) list.push("microphone");
  if (permissions?.geolocation) list.push("geolocation");
  if (permissions?.clipboardWrite) list.push("clipboard-write");
  return list.join("; ");
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export class AppHostManager {
  private server: http.Server | null = null;
  private port = 0;
  private apps = new Map<string, AppInstance>();
  private sseClients = new Map<string, Set<http.ServerResponse>>();
  private sandboxTemplate: string;
  private mcpManager: MCPManager | null = null;

  constructor() {
    this.sandboxTemplate = readFileSync(findSandboxPath(), "utf-8");
  }

  setMcpManager(mcp: MCPManager): void { this.mcpManager = mcp; }
  getPort(): number { return this.port; }

  async start(): Promise<void> {
    const self = this;
    return new Promise((resolve, reject) => {
      self.server = http.createServer((req, res) => {
        self.handleRequest(req, res).catch((err) => {
          if (!res.headersSent) { res.writeHead(500); res.end(String(err)); }
        });
      });
      self.server.on("error", reject);
      self.server.listen(0, "127.0.0.1", () => {
        self.port = (self.server!.address() as { port: number }).port;
        resolve();
      });
    });
  }

  registerApp(app: Omit<AppInstance, "id" | "localUrl" | "createdAt">): AppInstance {
    const instance: AppInstance = {
      ...app,
      id: randomUUID().slice(0, 8),
      localUrl: "",
      createdAt: Date.now(),
    };
    instance.localUrl = `http://127.0.0.1:${this.port}/app/${instance.id}`;
    this.apps.set(instance.id, instance);
    return instance;
  }

  unregisterApp(id: string): void { this.apps.delete(id); }

  getApp(id: string): AppInstance | undefined { return this.apps.get(id); }

  pushToApp(appId: string, message: object): void {
    const clients = this.sseClients.get(appId);
    if (!clients) return;
    const data = `data: ${JSON.stringify(message)}\n\n`;
    for (const res of clients) {
      try { res.write(data); } catch {}
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
    const pathname = url.pathname;

    const appMatch = pathname.match(/^\/app\/([^/]+)$/);
    if (appMatch && req.method === "GET") return this.serveAppPage(appMatch[1], res);

    const htmlMatch = pathname.match(/^\/api\/app\/([^/]+)\/html$/);
    if (htmlMatch && req.method === "GET") return this.serveAppHtml(htmlMatch[1], res);

    const bridgeMatch = pathname.match(/^\/api\/bridge\/([^/]+)$/);
    if (bridgeMatch && req.method === "POST") return this.handleBridgePost(bridgeMatch[1], req, res);

    const sseMatch = pathname.match(/^\/api\/bridge\/([^/]+)\/events$/);
    if (sseMatch && req.method === "GET") return this.handleBridgeSSE(sseMatch[1], req, res);

    res.writeHead(404); res.end("Not found");
  }

  private serveAppPage(appId: string, res: http.ServerResponse): void {
    const app = this.apps.get(appId);
    if (!app) { res.writeHead(404); res.end("App not found"); return; }
    const cspHeader = buildCspHeader(app.csp);

    let page = this.sandboxTemplate;

    // Inject MDX data (if data mode) BEFORE MDX Runtime replaces the placeholder
    if (!app.html && (app.mdx || app.data)) {
      const dataScript = [
        '<script>',
        'var __MDX_SOURCE__ = ' + JSON.stringify(app.mdx ?? "") + ';',
        'var __MDX_DATA__ = ' + JSON.stringify(app.data ?? {}) + ';',
        '</script>',
      ].join("\n");
      page = page.replace("<!-- MDX_DATA_PLACEHOLDER -->", dataScript);
    } else {
      page = page.replace("<!-- MDX_DATA_PLACEHOLDER -->", "");
    }

    // Inject MDX Runtime bundle
    const mdxRuntimeJs = generateMdxRuntimeBundle();
    page = page.replace("<!-- MDX_RUNTIME_PLACEHOLDER -->", "<script>" + mdxRuntimeJs + "</script>");

    res.writeHead(200, { "Content-Type": "text/html", "Content-Security-Policy": cspHeader });
    res.end(page);
  }

  private serveAppHtml(appId: string, res: http.ServerResponse): void {
    const app = this.apps.get(appId);
    if (!app) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(app.html);
  }

  private async handleBridgePost(appId: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const app = this.apps.get(appId);
    if (!app) { res.writeHead(404); res.end(); return; }
    const body = await readBody(req);
    let msg: any;
    try { msg = JSON.parse(body); } catch { res.writeHead(400); res.end(); return; }

    if (msg.method === "ui/notifications/sandbox-proxy-ready") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id ?? null, result: {} }));
      return;
    }

    if (msg.method === "ui/initialize") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { hostContext: { appId } } }));
      return;
    }

    if (msg.method === "tools/call" && this.mcpManager) {
      const client = this.mcpManager.getClient(app.serverName);
      if (!client) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "Server not connected" } }));
        return;
      }
      try {
        const result = await client.callTool(msg.params.name, msg.params.arguments);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
      } catch (err: any) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: err.message } }));
      }
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } }));
  }

  private handleBridgeSSE(appId: string, _req: http.IncomingMessage, res: http.ServerResponse): void {
    const app = this.apps.get(appId);
    if (!app) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });

    let clients = this.sseClients.get(appId);
    if (!clients) { clients = new Set(); this.sseClients.set(appId, clients); }
    clients.add(res);

    const heartbeat = setInterval(() => {
      try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
    }, 15000);
    res.on("close", () => {
      clearInterval(heartbeat);
      clients?.delete(res);
    });
  }

  async shutdown(): Promise<void> {
    this.apps.clear();
    return new Promise((resolve) => {
      if (this.server) { this.server.close(() => resolve()); }
      else { resolve(); }
    });
  }
}
