import { describe, expect, it, vi } from "vitest";

import { HarnessEventBus } from "../../src/core/events.js";
import { WebUiBackend } from "../../src/ui/web/web-backend.js";
import { createHarnessApiFixture } from "../helpers/harness-api.js";

function session(id: string) {
  return {
    id,
    title: "Target",
    createdAt: 1,
    updatedAt: 2,
    modelProvider: "test",
    modelId: "model",
    messageCount: 1,
    projectPath: "/project",
    preview: "",
    hasImages: false,
    imageCount: 0,
    totalActiveMs: 0,
    contentHash: "",
  };
}

function setup() {
  const events = new HarnessEventBus({ error: vi.fn() } as any);
  const target = session("TARGET-SESSION");
  const switchSession = vi.fn(async () => ({
    session: target,
    messages: [{ role: "user", content: "target" }],
    agentMessages: [],
  }));
  const harness = createHarnessApiFixture({
    events,
    conversation: {
      ...createHarnessApiFixture().conversation,
      snapshot: () => ({
        messages: [{ role: "user", content: "target" }],
        agentMessages: [],
        modelName: "model",
      }),
    },
    sessions: {
      ...createHarnessApiFixture().sessions,
      switch: switchSession,
      currentMetadata: () => undefined,
      list: () => [target],
    },
  });
  const backend = new WebUiBackend({
    webRoot: ".",
    port: 0,
    harness,
  });
  const send = vi.fn();
  const client = { send } as any;
  (backend as any).clearConversationView = vi.fn();
  (backend as any).replayMessages = vi.fn();
  (backend as any).pushSessionList = vi.fn();
  (backend as any).buildConfigData = vi.fn(() => ({}));
  return { backend, client, harness, switchSession };
}

describe("Web session switching adapters", () => {
  it("routes sidebar loads through Harness.switchSession", async () => {
    const { backend, client, harness, switchSession } = setup();

    await (backend as any).handleSession(client, {
      type: "session",
      action: "load",
      id: "TARGET",
    });

    expect(switchSession).toHaveBeenCalledWith({
      sessionIdOrPrefix: "TARGET",
      pendingPermission: undefined,
    });
    expect((backend as any).clearConversationView).toHaveBeenCalledOnce();
    expect((backend as any).replayMessages).toHaveBeenCalledWith(
      [{ role: "user", content: "target" }],
    );
  });

  it("routes Web slash loads through the same Harness API", async () => {
    const { backend, client, switchSession } = setup();

    await (backend as any).handleSlashCommand(client, "/session load TARGET");

    expect(switchSession).toHaveBeenCalledWith({
      sessionIdOrPrefix: "TARGET",
      pendingPermission: undefined,
    });
    expect((backend as any).clearConversationView).toHaveBeenCalledOnce();
    expect((backend as any).replayMessages).toHaveBeenCalledOnce();
  });
});
