import { describe, expect, it } from "vitest";

import type { AgentApplicationSnapshot } from "../../../src/agents/application/types.js";
import { resolveVisionApplicationConfig } from "../../../src/agents/runtimes/vision-model.js";

function application(model?: string): AgentApplicationSnapshot {
  return {
    name: "vision",
    description: "Vision",
    systemPrompt: "Vision",
    model,
    source: { kind: "bundled", path: "vision.md" },
    digest: "a".repeat(64),
    registryGeneration: 1,
  };
}

const config = {
  provider: "deepseek",
  modelId: "deepseek-chat",
  apiKey: "main-key",
  vision: {
    provider: "openai",
    model: "gpt-4.1-mini",
    key: "vision-key",
  },
};

describe("Vision Agent model resolution", () => {
  it("resolves the portable vision alias from runtime configuration", () => {
    expect(resolveVisionApplicationConfig(application("vision"), config))
      .toEqual(config.vision);
  });

  it("allows Agent.md to select an explicit provider and model", () => {
    expect(resolveVisionApplicationConfig(application("anthropic/claude-sonnet-4"), config))
      .toEqual({
        provider: "anthropic",
        model: "claude-sonnet-4",
        key: undefined,
      });
  });

  it("uses the configured Vision provider for a bare model selector", () => {
    expect(resolveVisionApplicationConfig(application("gpt-4o"), config))
      .toEqual({
        provider: "openai",
        model: "gpt-4o",
        key: "vision-key",
      });
  });

  it("supports inherit and configured Claude model aliases", () => {
    expect(resolveVisionApplicationConfig(application("inherit"), config))
      .toEqual({
        provider: "deepseek",
        model: "deepseek-chat",
        key: "main-key",
      });
    expect(resolveVisionApplicationConfig(application("sonnet"), {
      ...config,
      agentModelAliases: { sonnet: "anthropic/claude-sonnet-4" },
    })).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4",
      key: undefined,
    });
  });
});
