import { describe, expectTypeOf, it } from "vitest";

import type { CommandManifest } from "../../src/commands/types.js";
import type { RuntimeConfig } from "../../src/config/types.js";
import type { ContextConfig } from "../../src/context/types.js";
import type { Driver } from "../../src/drivers/types.js";
import type { VisionConfig } from "../../src/drivers/vision/types.js";
import type { OpenDesignIntegrationConfig } from "../../src/integrations/open-design/types.js";
import type { MemoryConfig, MemoryEntry } from "../../src/memory/types.js";
import type { RetryConfig, ThinkingLevel } from "../../src/models/types.js";
import type {
  PermissionPromptResult,
  PermissionRuleConfig,
  PermissionsConfig,
} from "../../src/permissions/types.js";
import type { ImageRef } from "../../src/resources/images/types.js";
import type { Skill, SkillManifest } from "../../src/skills/types.js";

describe("owner-defined contracts", () => {
  it("are importable without the Core compatibility type module", () => {
    expectTypeOf<RuntimeConfig>().toHaveProperty("projectPath");
    expectTypeOf<ContextConfig>().toHaveProperty("strategy");
    expectTypeOf<Driver>().toHaveProperty("tools");
    expectTypeOf<VisionConfig>().toHaveProperty("provider");
    expectTypeOf<OpenDesignIntegrationConfig>().toHaveProperty("autoStart");
    expectTypeOf<MemoryConfig>().toHaveProperty("enabled");
    expectTypeOf<MemoryEntry>().toHaveProperty("scope");
    expectTypeOf<RetryConfig>().toHaveProperty("maxRetries");
    expectTypeOf<ThinkingLevel>().toEqualTypeOf<
      "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
    >();
    expectTypeOf<PermissionsConfig>().toHaveProperty("rules");
    expectTypeOf<PermissionRuleConfig>().toHaveProperty("decision");
    expectTypeOf<PermissionPromptResult>().toHaveProperty("decision");
    expectTypeOf<ImageRef>().toHaveProperty("hash");
    expectTypeOf<Skill>().toHaveProperty("tools");
    expectTypeOf<SkillManifest>().toHaveProperty("path");
    expectTypeOf<CommandManifest>().toHaveProperty("body");
  });
});
