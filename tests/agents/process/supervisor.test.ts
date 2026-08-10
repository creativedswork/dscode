import { describe, expect, it, vi } from "vitest";

import { HarnessEventBus } from "../../../src/application/events.js";
import { createMainAgentContext } from "../../../src/agents/process/context.js";
import { AgentSupervisor } from "../../../src/agents/process/supervisor.js";
import type { AgentApplicationSnapshot } from "../../../src/agents/definitions/types.js";
import type {
  AgentProcessInput,
  AgentProcessOutput,
  AgentProcessRuntime,
} from "../../../src/agents/runtimes/runtime.js";

function application(
  name: string,
  overrides: Partial<AgentApplicationSnapshot> = {},
): AgentApplicationSnapshot {
  return {
    name,
    description: name,
    systemPrompt: `${name} prompt`,
    permissionMode: "default",
    source: { kind: "bundled", path: `${name}.md` },
    digest: name.padEnd(64, "0"),
    registryGeneration: 1,
    ...overrides,
  };
}

class ImmediateRuntime implements AgentProcessRuntime {
  readonly capabilities = { suspend: false, messaging: false };

  async start(input: AgentProcessInput): Promise<AgentProcessOutput> {
    return { text: `done: ${input.prompt}`, details: { ok: true } };
  }

  async terminate(): Promise<void> {}
  kill(): void {}
}

class BlockingRuntime implements AgentProcessRuntime {
  readonly capabilities = { suspend: false, messaging: false };

  async start(_input: AgentProcessInput, signal: AbortSignal): Promise<AgentProcessOutput> {
    return new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }

  async terminate(): Promise<void> {}
  kill(): void {}
}

class MessagingRuntime extends BlockingRuntime {
  readonly capabilities = { suspend: false, messaging: true };
  messages: string[] = [];

  sendMessage(message: { content: string }): void {
    this.messages.push(message.content);
  }
}

class StatefulRuntime extends ImmediateRuntime {
  async start(input: AgentProcessInput): Promise<AgentProcessOutput> {
    await input.onStateChange?.("waiting");
    await input.onProgress?.({ phase: "tool", message: "Running read_file" });
    await input.onCheckpoint?.({ messages: ["checkpoint"], usage: { input: 1 } });
    await input.onStateChange?.("running");
    return super.start(input);
  }
}

function setup(
  runtime: AgentProcessRuntime,
  availableTools: () => readonly string[] = () => ["read_file"],
  generalOverrides: Partial<AgentApplicationSnapshot> = {},
): {
  supervisor: AgentSupervisor;
  mainAgentId: string;
  events: string[];
  saves: unknown[];
  setSaveError(error?: Error): void;
} {
  const apps = new Map([
    ["main", application("main")],
    ["general", application("general", generalOverrides)],
  ]);
  const registry = {
    require(name: string) {
      const app = apps.get(name);
      if (!app) throw new Error(`missing ${name}`);
      return app;
    },
    list() {
      return [...apps.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  };
  const saves: unknown[] = [];
  let saveError: Error | undefined;
  const store = {
    async save(value: any) {
      if (saveError) throw saveError;
      saves.push({
        state: value.state,
        parentSessionId: value.parentSessionId,
        contextParentSessionId: value.context.parentSessionId,
        allowedTools: value.context.allowedTools,
        recording: value.recording,
        runtimeSnapshot: value.runtimeSnapshot,
      });
    },
  };
  const logger = { error: vi.fn() };
  const eventBus = new HarnessEventBus(logger as any);
  const events: string[] = [];
  for (const type of [
    "agent:spawned",
    "agent:state",
    "agent:progress",
    "agent:output",
    "agent:exit",
  ] as const) {
    eventBus.on(type, () => events.push(type));
  }
  const supervisor = new AgentSupervisor(
    registry as any,
    () => runtime,
    store as any,
    eventBus,
    logger as any,
    availableTools,
  );
  const main = supervisor.registerMain(
    application("main"),
    new ImmediateRuntime(),
    createMainAgentContext("/project", "session-1", ["read_file"]),
  );
  return {
    supervisor,
    mainAgentId: main.agentId,
    events,
    saves,
    setSaveError(error?: Error) {
      saveError = error;
    },
  };
}

describe("AgentSupervisor", () => {
  it("exposes immutable Application summaries without runtime configuration", () => {
    const { supervisor } = setup(new ImmediateRuntime());

    const applications = supervisor.listApplications();

    expect(applications).toEqual([
      expect.objectContaining({ name: "general", description: "general" }),
      expect.objectContaining({ name: "main", description: "main" }),
    ]);
    expect(applications[0]).not.toHaveProperty("systemPrompt");
    expect(Object.isFrozen(applications)).toBe(true);
    expect(Object.isFrozen(applications[0])).toBe(true);
  });

  it("runs a foreground child with PID/PPID and emits lifecycle events", async () => {
    const { supervisor, mainAgentId, events, saves } = setup(new ImmediateRuntime());
    const spawned = await supervisor.spawn({
      application: "general",
      description: "Researcher: inspect implementation",
      input: { prompt: "inspect" },
      parentAgentId: mainAgentId,
    });

    expect(spawned.result?.state).toBe("completed");
    expect(spawned.result?.output).toBe("done: inspect");
    const child = supervisor.require(spawned.agentId);
    expect(child.description).toBe("Researcher: inspect implementation");
    expect(child.parentAgentId).toBe(mainAgentId);
    expect(child.parentSessionId).toBe("session-1");
    expect(child.recording).toBe("session");
    expect(child.context.depth).toBe(1);
    expect(events).toContain("agent:spawned");
    expect(events).toContain("agent:output");
    expect(events.at(-1)).toBe("agent:exit");
    expect(saves.length).toBeGreaterThanOrEqual(3);
  });

  it("uses the Application attachment default unless the caller overrides it", async () => {
    const { supervisor, mainAgentId } = setup(
      new ImmediateRuntime(),
      () => ["read_file"],
      { background: true },
    );

    const background = await supervisor.spawn({
      application: "general",
      input: { prompt: "independent" },
      parentAgentId: mainAgentId,
    });
    expect(background.result).toBeUndefined();
    expect(supervisor.require(background.agentId).attachment).toBe("background");
    await supervisor.wait(background.agentId);

    const foreground = await supervisor.spawn({
      application: "general",
      input: { prompt: "required" },
      parentAgentId: mainAgentId,
      attachment: "foreground",
    });
    expect(foreground.result?.output).toBe("done: required");
    expect(supervisor.require(foreground.agentId).attachment).toBe("foreground");
  });

  it("persists process-only children while preserving lifecycle events", async () => {
    const { supervisor, mainAgentId, events, saves } = setup(new ImmediateRuntime());

    const spawned = await supervisor.spawn({
      application: "general",
      input: { prompt: "diagnose" },
      parentAgentId: mainAgentId,
      recording: "process-only",
    });

    expect(spawned.result?.state).toBe("completed");
    expect(supervisor.require(spawned.agentId).recording).toBe("process-only");
    expect(saves).toContainEqual(expect.objectContaining({
      recording: "process-only",
      state: "completed",
    }));
    expect(events).toContain("agent:spawned");
    expect(events.at(-1)).toBe("agent:exit");
  });

  it("separates the display prompt from the runtime prompt", async () => {
    const runtime = new ImmediateRuntime();
    const { supervisor, mainAgentId } = setup(runtime);
    let spawnedInput = "";
    const events = (supervisor as any).events as HarnessEventBus;
    events.on("agent:spawned", (event) => {
      if (event.application === "general") spawnedInput = event.input;
    });

    const spawned = await supervisor.spawn({
      application: "general",
      parentAgentId: mainAgentId,
      input: {
        prompt: "runtime prompt\n\nAttached files: /private/image.jpg",
        displayPrompt: "describe this image",
      },
    });

    expect(spawnedInput).toBe("describe this image");
    expect(spawned.result?.output).toBe(
      "done: runtime prompt\n\nAttached files: /private/image.jpg",
    );
  });

  it("keeps one Runtime when a background child is killed", async () => {
    const runtime = new BlockingRuntime();
    const { supervisor, mainAgentId } = setup(runtime);
    const spawned = await supervisor.spawn({
      application: "general",
      input: { prompt: "wait" },
      parentAgentId: mainAgentId,
      attachment: "background",
    });

    expect(spawned.result).toBeUndefined();
    expect(supervisor.require(spawned.agentId).state).toBe("running");
    const exit = await supervisor.kill(spawned.agentId);
    expect(exit.state).toBe("killed");
    expect(supervisor.require(spawned.agentId).runtime).toBe(runtime);
  });

  it("enforces maximum process depth", async () => {
    const { supervisor, mainAgentId } = setup(new ImmediateRuntime());
    const child = await supervisor.spawn({
      application: "general",
      input: { prompt: "first" },
      parentAgentId: mainAgentId,
    });

    await expect(supervisor.spawn({
      application: "general",
      input: { prompt: "second" },
      parentAgentId: child.agentId,
    })).rejects.toThrow("exceeds maximum");
  });

  it("partitions background exit notifications by parentSessionId", async () => {
    const { supervisor, mainAgentId } = setup(new ImmediateRuntime());
    const spawned = await supervisor.spawn({
      application: "general",
      input: { prompt: "background" },
      parentAgentId: mainAgentId,
      attachment: "background",
    });
    await supervisor.wait(spawned.agentId);

    expect(supervisor.consumeNotifications("other-session")).toEqual([]);
    expect(supervisor.consumeNotifications("session-1")).toEqual([
      expect.objectContaining({ agentId: spawned.agentId, state: "completed" }),
    ]);
    expect(supervisor.consumeNotifications("session-1")).toEqual([]);
  });

  it("persists a Main Process session rebind", async () => {
    const { supervisor, mainAgentId, saves } = setup(new ImmediateRuntime());

    await supervisor.updateParentSession(mainAgentId, "session-2", "/project-2");

    const main = supervisor.require(mainAgentId);
    expect(main.parentSessionId).toBe("session-2");
    expect(main.context.parentSessionId).toBe("session-2");
    expect(main.context.cwd).toBe("/project-2");
    expect(saves).toContainEqual(expect.objectContaining({
      parentSessionId: "session-2",
      contextParentSessionId: "session-2",
    }));
  });

  it("refreshes Main capabilities for MCP tools registered after initialization", async () => {
    const tools = ["read_file"];
    const { supervisor, mainAgentId, saves } = setup(
      new ImmediateRuntime(),
      () => tools,
    );
    tools.push("mcp__github__search_repos");

    await supervisor.updateMainCapabilities(mainAgentId, tools);
    const spawned = await supervisor.spawn({
      application: "general",
      input: { prompt: "search repositories" },
      parentAgentId: mainAgentId,
    });

    expect(supervisor.require(mainAgentId).context.allowedTools).toContain(
      "mcp__github__search_repos",
    );
    expect(supervisor.require(spawned.agentId).context.allowedTools).toContain(
      "mcp__github__search_repos",
    );
    expect(saves).toContainEqual(expect.objectContaining({
      allowedTools: ["read_file", "mcp__github__search_repos"],
    }));
  });

  it("rolls back a Main Process session rebind when persistence fails", async () => {
    const { supervisor, mainAgentId, setSaveError } = setup(new ImmediateRuntime());
    const previousContext = supervisor.require(mainAgentId).context;
    setSaveError(new Error("disk full"));

    await expect(
      supervisor.updateParentSession(mainAgentId, "session-2", "/project-2"),
    ).rejects.toThrow("disk full");

    const main = supervisor.require(mainAgentId);
    expect(main.parentSessionId).toBe("session-1");
    expect(main.context).toBe(previousContext);
  });

  it("does not rebind existing SubAgents with the Main Process", async () => {
    const runtime = new BlockingRuntime();
    const { supervisor, mainAgentId } = setup(runtime);
    const spawned = await supervisor.spawn({
      application: "general",
      input: { prompt: "background" },
      parentAgentId: mainAgentId,
      attachment: "background",
    });
    const childContext = supervisor.require(spawned.agentId).context;

    await supervisor.updateParentSession(mainAgentId, "session-2");

    const child = supervisor.require(spawned.agentId);
    expect(child.parentSessionId).toBe("session-1");
    expect(child.context).toBe(childContext);
    await supervisor.kill(spawned.agentId);
    expect(supervisor.consumeNotifications("session-2")).toEqual([]);
    expect(supervisor.consumeNotifications("session-1")).toEqual([
      expect.objectContaining({ agentId: spawned.agentId, state: "killed" }),
    ]);
  });

  it("makes new SubAgents inherit the rebound Main Process session", async () => {
    const { supervisor, mainAgentId } = setup(new ImmediateRuntime());
    await supervisor.updateParentSession(mainAgentId, "session-2");

    const spawned = await supervisor.spawn({
      application: "general",
      input: { prompt: "new task" },
      parentAgentId: mainAgentId,
    });

    expect(supervisor.require(spawned.agentId).parentSessionId).toBe("session-2");
  });

  it("supports IPC only while a messaging Runtime is active", async () => {
    const runtime = new MessagingRuntime();
    const { supervisor, mainAgentId } = setup(runtime);
    const spawned = await supervisor.spawn({
      application: "general",
      input: { prompt: "wait" },
      parentAgentId: mainAgentId,
      attachment: "background",
    });

    supervisor.sendMessage(spawned.agentId, "new requirement");
    supervisor.require(spawned.agentId).state = "waiting";
    supervisor.sendMessage(spawned.agentId, "while tool is running");
    expect(runtime.messages).toEqual([
      "new requirement",
      "while tool is running",
    ]);
    await supervisor.kill(spawned.agentId);
    expect(() => supervisor.sendMessage(spawned.agentId, "too late"))
      .toThrow("already exited");
  });

  it("persists waiting transitions and turn checkpoints", async () => {
    const { supervisor, mainAgentId, saves, events } = setup(new StatefulRuntime());
    const spawned = await supervisor.spawn({
      application: "general",
      input: { prompt: "inspect" },
      parentAgentId: mainAgentId,
    });

    expect(spawned.result?.state).toBe("completed");
    expect(saves).toContainEqual(expect.objectContaining({ state: "waiting" }));
    expect(saves).toContainEqual(expect.objectContaining({
      runtimeSnapshot: { messages: ["checkpoint"], usage: { input: 1 } },
    }));
    expect(events).toContain("agent:progress");
  });

  it("detaches a foreground process without restarting its Runtime", async () => {
    const runtime = new BlockingRuntime();
    const { supervisor, mainAgentId } = setup(runtime);
    let childId = "";
    const spawning = supervisor.spawn({
      application: "general",
      input: { prompt: "keep running" },
      parentAgentId: mainAgentId,
      onSpawn: (agentId) => {
        childId = agentId;
      },
    });
    await vi.waitFor(() => expect(childId).not.toBe(""));

    await supervisor.background(childId);
    const detached = await spawning;
    const child = supervisor.require(childId);
    expect(detached).toEqual({ agentId: childId });
    expect(child.attachment).toBe("background");
    expect(child.context.attachment).toBe("background");
    expect(child.runtime).toBe(runtime);

    await supervisor.kill(childId);
  });

  it("does not keep the parent tool AbortSignal attached to a background process", async () => {
    const runtime = new BlockingRuntime();
    const { supervisor, mainAgentId } = setup(runtime);
    const controller = new AbortController();
    const spawned = await supervisor.spawn({
      application: "general",
      input: { prompt: "background" },
      parentAgentId: mainAgentId,
      attachment: "background",
      signal: controller.signal,
    });

    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(supervisor.require(spawned.agentId).state).toBe("running");
    await supervisor.kill(spawned.agentId);
  });
});
