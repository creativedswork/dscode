import { afterEach, describe, expect, it } from "vitest";

import { AppHostManager, buildAllowAttr, buildCspHeader } from "../../src/mcp/app/host.js";

async function getText(url: string): Promise<string> {
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return await response.text();
}

describe("MCP App host helpers", () => {
  it("builds the default CSP header", () => {
    const header = buildCspHeader();

    expect(header).toContain("connect-src 'self'");
    expect(header).toContain("frame-src 'none'");
    expect(header).toContain("default-src 'none'");
  });

  it("includes configured connect domains in CSP header", () => {
    const header = buildCspHeader({
      connectDomains: ["https://api.example.com"],
      resourceDomains: ["https://cdn.example.com"],
    });

    expect(header).toContain("connect-src 'self' https://api.example.com");
    expect(header).toContain("script-src 'self' 'unsafe-inline' https://cdn.example.com");
    expect(header).toContain("img-src 'self' data: https://cdn.example.com");
  });

  it("serializes allow permissions", () => {
    expect(buildAllowAttr()).toBe("");
    expect(buildAllowAttr({ camera: {}, clipboardWrite: {} })).toBe("camera; clipboard-write");
  });
});

describe("AppHostManager", () => {
  let host: AppHostManager | null = null;

  afterEach(async () => {
    if (host) {
      await host.shutdown();
      host = null;
    }
  });

  it("starts and registers apps with a localhost URL", async () => {
    host = new AppHostManager();
    await host.start();

    const app = host.registerApp({
      resourceUri: "ui://test/app",
      toolName: "get-test-data",
      serverName: "test-server",
      mdx: "<Card title=\"Test\">Hello</Card>",
      data: { message: "hello" },
    });

    expect(host.getPort()).toBeGreaterThan(0);
    expect(app.id).toMatch(/^[a-f0-9]{8}$/);
    expect(app.localUrl).toBe(`http://127.0.0.1:${host.getPort()}/app/${app.id}`);
  });

  it("renders MDX data mode when html is absent", async () => {
    host = new AppHostManager();
    await host.start();

    const app = host.registerApp({
      resourceUri: "ui://test/mdx",
      toolName: "get-test-data",
      serverName: "test-server",
      mdx: "<Card title=\"MDX Test\"><Metrics items={summary}/></Card>",
      data: { summary: { revenue: 12_345 } },
    });

    const page = await getText(app.localUrl);
    expect(page).toContain("__MDX_SOURCE__");
    expect(page).toContain("MDX Test");
    expect(page).toContain("__MDX_DATA__");
  });

  it("prefers server HTML over MDX data mode", async () => {
    host = new AppHostManager();
    await host.start();

    const app = host.registerApp({
      resourceUri: "ui://test/html",
      toolName: "get-test-data",
      serverName: "test-server",
      html: "<!DOCTYPE html><html><body><h1>Legacy HTML App</h1></body></html>",
      mdx: "<Card title=\"Should Not Render\">Fallback</Card>",
      data: { summary: { revenue: 99 } },
    });

    const page = await getText(app.localUrl);
    expect(page).not.toContain('var __MDX_SOURCE__ =');
    expect(page).not.toContain('var __MDX_DATA__ =');
    expect(page).not.toContain("Should Not Render");

    const legacyHtml = await getText(`http://127.0.0.1:${host.getPort()}/api/app/${app.id}/html`);
    expect(legacyHtml).toContain("Legacy HTML App");
  });
});
