import type { AddressInfo } from "node:net";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { WebUiBackend } from "../../src/ui/web/web-backend.js";
import { createHarnessApiFixture } from "../helpers/harness-api.js";

async function fetchFrom(root: string, path: string): Promise<Response> {
  const backend = new WebUiBackend({
    webRoot: root,
    port: 0,
    harness: createHarnessApiFixture(),
  });
  const server = (backend as any).httpServer;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

describe("Web path safety", () => {
  it("rejects lexical and symlink SPA traversal", async () => {
    const base = mkdtempSync(join(tmpdir(), "dscode-web-root-"));
    const root = join(base, "web");
    const external = join(base, "external");
    mkdirSync(root);
    mkdirSync(external);
    writeFileSync(join(root, "index.html"), "index");
    writeFileSync(join(external, "secret.json"), "secret");
    symlinkSync(join(external, "secret.json"), join(root, "linked.json"));

    const lexical = await fetchFrom(root, "/..%2Fexternal%2Fsecret.json");
    const linked = await fetchFrom(root, "/linked.json");

    expect(lexical.status).toBe(404);
    expect(linked.status).toBe(404);
  });

  it("stores uploaded content under a server-sanitized name", async () => {
    const project = mkdtempSync(join(tmpdir(), "dscode-web-project-"));
    mkdirSync(join(project, "web"));
    writeFileSync(join(project, "web", "index.html"), "index");
    const prompt = vi.fn(async () => {});
    const harness = createHarnessApiFixture({
      settings: {
        ...createHarnessApiFixture().settings,
        get: () => ({
          ...createHarnessApiFixture().settings.get(),
          projectPath: project,
        }),
      },
      conversation: {
        ...createHarnessApiFixture().conversation,
        prompt,
      },
      sessions: {
        ...createHarnessApiFixture().sessions,
        currentId: () => "session-1",
      },
    });
    const backend = new WebUiBackend({
      webRoot: join(project, "web"),
      port: 0,
      harness,
    });

    await (backend as any).handleMessage({ send: vi.fn() }, {
      type: "chat",
      text: "",
      uploadedFiles: [{
        name: "../../outside.txt",
        content: Buffer.from("content").toString("base64"),
      }],
    });

    expect(existsSync(join(project, "outside.txt"))).toBe(false);
    const uploadDir = join(project, ".dscode", "uploads", "session-1");
    const files = readdirSync(uploadDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/-outside\.txt$/);
    expect(readFileSync(join(uploadDir, files[0]), "utf8")).toBe("content");
    expect(prompt).toHaveBeenCalledWith(expect.stringContaining(uploadDir));
  });
});
