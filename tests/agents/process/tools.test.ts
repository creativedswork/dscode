import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ImageCache } from "../../../src/drivers/vision/cache.js";
import type { AgentApplicationSummary } from "../../../src/agents/application/types.js";
import type { AgentSupervisor } from "../../../src/agents/process/supervisor.js";
import {
  AGENT_PROCESS_TOOL_NAMES,
  makeAgentProcessTools,
} from "../../../src/agents/tools/process-tools.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

function summary(name: string, description: string): AgentApplicationSummary {
  return {
    name,
    description,
    source: { kind: "project-dscode", path: `.dscode/agents/${name}.md` },
  };
}

describe("Agent process tools", () => {
  it("projects the live Application catalog into the spawn_agent description", () => {
    let applications = [
      summary("general", "General purpose work"),
      summary("reviewer", "Review final artifacts"),
    ];
    const supervisor = {
      listApplications: () => applications,
    } as unknown as AgentSupervisor;
    const spawn = makeAgentProcessTools(supervisor, "main")
      .find((tool) => tool.name === "spawn_agent");

    expect(spawn?.description).toContain("- general: General purpose work");
    expect(spawn?.description).toContain("- reviewer: Review final artifacts");

    applications = [
      summary("general", "General purpose work"),
      summary("researcher", "Research source material"),
    ];

    expect(spawn?.description).toContain("- researcher: Research source material");
    expect(spawn?.description).not.toContain("- reviewer:");
  });

  it("honors the user default and lets the parent override each delegation", async () => {
    const spawnProcess = vi.fn(async () => ({ agentId: "agent-1" }));
    const supervisor = {
      listApplications: () => [summary("general", "General purpose work")],
      require: () => ({ context: { cwd: process.cwd() } }),
      spawn: spawnProcess,
    } as unknown as AgentSupervisor;
    const spawn = makeAgentProcessTools(supervisor, "main")
      .find((tool) => tool.name === "spawn_agent");
    const input = {
      application: "general",
      description: "Independent research",
      input: { prompt: "Research this topic" },
    };

    await (spawn!.execute as any)(
      "call-default",
      input,
      new AbortController().signal,
    );
    await (spawn!.execute as any)(
      "call-foreground",
      { ...input, background: false },
      new AbortController().signal,
    );
    await (spawn!.execute as any)(
      "call-background",
      { ...input, background: true },
      new AbortController().signal,
    );

    expect(spawnProcess).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        description: "Independent research",
        attachment: undefined,
      }),
    );
    expect(spawnProcess).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ attachment: "foreground" }),
    );
    expect(spawnProcess).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ attachment: "background" }),
    );
    expect(spawn?.description).toContain(
      "Honor the Application's scheduling default",
    );
  });

  it("does not expose polling tools to the model", () => {
    const supervisor = {
      listApplications: () => [summary("general", "General purpose work")],
    } as unknown as AgentSupervisor;
    const names = makeAgentProcessTools(supervisor, "main")
      .map((tool) => tool.name);

    expect(names).not.toContain("wait_agent");
    expect(names).not.toContain("get_agent_output");
    expect(AGENT_PROCESS_TOOL_NAMES).toEqual(names);
  });

  it("caches a project-local image file attachment before spawning", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-spawn-attachment-"));
    temporaryDirectories.push(root);
    const imagePath = join(root, "card.png");
    await writeFile(imagePath, Buffer.from("image"));
    const cached = {
      type: "image_ref" as const,
      hash: "cached.png",
      mimeType: "image/png",
    };
    vi.spyOn(ImageCache, "put").mockResolvedValue(cached);
    const spawn = vi.fn(async () => ({ agentId: "agent-1" }));
    const supervisor = {
      listApplications: () => [summary("vision", "Analyze images")],
      require: () => ({ context: { cwd: root } }),
      spawn,
    } as unknown as AgentSupervisor;
    const tool = makeAgentProcessTools(supervisor, "main")
      .find((item) => item.name === "spawn_agent");

    await (tool!.execute as any)("call-1", {
      application: "vision",
      description: "Review card",
      input: {
        prompt: "Review this card",
        attachments: [{ type: "file", uri: pathToFileURL(imagePath).href }],
      },
      background: true,
    }, new AbortController().signal);

    expect(ImageCache.put).toHaveBeenCalledWith(expect.objectContaining({
      type: "image",
      mimeType: "image/png",
    }));
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({
      input: {
        prompt: "Review this card",
        attachments: [{ type: "image", data: cached }],
      },
    }));
  });

  it("rejects local paths disguised as cached image references", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-spawn-attachment-"));
    temporaryDirectories.push(root);
    const supervisor = {
      listApplications: () => [summary("vision", "Analyze images")],
      require: () => ({ context: { cwd: root } }),
      spawn: vi.fn(),
    } as unknown as AgentSupervisor;
    const tool = makeAgentProcessTools(supervisor, "main")
      .find((item) => item.name === "spawn_agent");

    await expect((tool!.execute as any)("call-1", {
      application: "vision",
      description: "Review card",
      input: {
        prompt: "Review this card",
        attachments: [{
          type: "image",
          data: {
            type: "image_ref",
            hash: "file:///project/card.png",
            mimeType: "image/png",
          },
        }],
      },
    }, new AbortController().signal)).rejects.toThrow("use a file attachment");
  });

  it("rejects image references that are not present in ImageCache", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-spawn-attachment-"));
    temporaryDirectories.push(root);
    vi.spyOn(ImageCache, "get").mockResolvedValue(null);
    const supervisor = {
      listApplications: () => [summary("vision", "Analyze images")],
      require: () => ({ context: { cwd: root } }),
      spawn: vi.fn(),
    } as unknown as AgentSupervisor;
    const tool = makeAgentProcessTools(supervisor, "main")
      .find((item) => item.name === "spawn_agent");

    await expect((tool!.execute as any)("call-1", {
      application: "vision",
      description: "Review card",
      input: {
        prompt: "Review this card",
        attachments: [{
          type: "image",
          data: {
            type: "image_ref",
            hash: "missing.png",
            mimeType: "image/png",
          },
        }],
      },
    }, new AbortController().signal)).rejects.toThrow("Unknown cached image reference");
  });

  it("rejects image file attachments outside the parent Agent cwd", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-spawn-root-"));
    const outside = await mkdtemp(join(tmpdir(), "dscode-spawn-outside-"));
    temporaryDirectories.push(root, outside);
    const imagePath = join(outside, "card.png");
    await writeFile(imagePath, Buffer.from("image"));
    const supervisor = {
      listApplications: () => [summary("vision", "Analyze images")],
      require: () => ({ context: { cwd: root } }),
      spawn: vi.fn(),
    } as unknown as AgentSupervisor;
    const tool = makeAgentProcessTools(supervisor, "main")
      .find((item) => item.name === "spawn_agent");

    await expect((tool!.execute as any)("call-1", {
      application: "vision",
      description: "Review card",
      input: {
        prompt: "Review this card",
        attachments: [{ type: "file", uri: imagePath }],
      },
    }, new AbortController().signal)).rejects.toThrow("outside Agent cwd");
  });

  it("rejects project-local image attachments larger than 20 MB", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-spawn-attachment-"));
    temporaryDirectories.push(root);
    const imagePath = join(root, "large.png");
    await writeFile(imagePath, "");
    await truncate(imagePath, 20 * 1024 * 1024 + 1);
    const supervisor = {
      listApplications: () => [summary("vision", "Analyze images")],
      require: () => ({ context: { cwd: root } }),
      spawn: vi.fn(),
    } as unknown as AgentSupervisor;
    const tool = makeAgentProcessTools(supervisor, "main")
      .find((item) => item.name === "spawn_agent");

    await expect((tool!.execute as any)("call-1", {
      application: "vision",
      description: "Review card",
      input: {
        prompt: "Review this card",
        attachments: [{ type: "file", uri: imagePath }],
      },
    }, new AbortController().signal)).rejects.toThrow("exceeds");
  });
});
