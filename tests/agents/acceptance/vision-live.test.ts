import { Agent as PiAgentRuntime } from "@earendil-works/pi-agent-core";
import type { Api, Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

import { AgentApplicationRegistry } from "../../../src/agents/definitions/registry.js";
import { PiAgentRuntimeAdapter } from "../../../src/agents/runtimes/pi-agent-runtime.js";
import {
  getEnvApiKey,
  resolveModel,
  streamSimple,
} from "../../../src/models/index.js";

const liveEnabled = process.env.DSCODE_VISION_E2E === "1";

describe.skipIf(!liveEnabled)("Vision PiAgentRuntime live smoke test", () => {
  it("runs the bundled Vision Application through PiAgentRuntime", async () => {
    const provider = process.env.AGENT_VISION_PROVIDER;
    const modelId = process.env.AGENT_VISION_MODEL;
    if (!provider || !modelId) {
      throw new Error("AGENT_VISION_PROVIDER and AGENT_VISION_MODEL are required");
    }
    const registry = new AgentApplicationRegistry({
      projectPath: process.cwd(),
      configDir: `${process.cwd()}/.dscode`,
    });
    await registry.load();
    const application = registry.require("vision");
    const model = resolveModel(provider, modelId);
    const agent = new PiAgentRuntime({
      initialState: {
        systemPrompt: application.systemPrompt,
        model,
        tools: [],
      },
      streamFn: (
        runtimeModel: Model<Api>,
        context: Context,
        options?: SimpleStreamOptions,
      ) => streamSimple(runtimeModel, context, {
        ...options,
        apiKey: options?.apiKey ?? getEnvApiKey(provider),
      }),
    });
    const output = await new PiAgentRuntimeAdapter(agent).start({
      prompt: "What is visible in this image?",
      attachments: [{
        type: "image",
        data: {
          type: "image",
          mimeType: "image/png",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4U8AAAAASUVORK5CYII=",
        },
      }],
    }, new AbortController().signal);

    expect(output.text.trim().length).toBeGreaterThan(0);
    expect(agent.state.tools).toEqual([]);
  }, 120_000);
});
