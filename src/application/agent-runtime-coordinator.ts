import { Agent as PiAgentRuntime } from "@earendil-works/pi-agent-core";
import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import type {
  Api,
  Context,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";

import type { AgentApplicationSnapshot } from "../agents/application/types.js";
import { loadAgentMemory } from "../agents/application/memory.js";
import { checkAgentCapability } from "../agents/process/capability.js";
import type {
  AgentContext,
} from "../agents/process/types.js";
import type { AgentSupervisor } from "../agents/process/supervisor.js";
import {
  AgentRuntimeFailure,
  FailedAgentRuntime,
  type AgentProcessRuntime,
} from "../agents/runtimes/runtime.js";
import { PiAgentRuntimeAdapter } from "../agents/runtimes/pi-agent-runtime.js";
import { resolveVisionApplicationConfig } from "../agents/runtimes/vision-model.js";
import { makeAgentProcessTools } from "../agents/tools/process-tools.js";
import type { RuntimeConfig } from "../config/types.js";
import { ContextManager } from "../context/manager.js";
import type { DriverRegistryPort } from "../drivers/types.js";
import type { HarnessEvent } from "../core/events.js";
import { getEnvApiKey, resolveModel } from "../models/index.js";
import { streamSimple } from "../models/index.js";
import { PermissionManager } from "../permissions/manager.js";
import type { PermissionPromptResult } from "../permissions/types.js";

export interface AgentRuntimeCoordinatorOptions {
  config(): RuntimeConfig;
  environment: Readonly<Record<string, string | undefined>>;
  drivers: DriverRegistryPort;
  supervisor(): AgentSupervisor;
  skillTool(): AgentTool<any>;
  skillManifest(name: string): {
    name: string;
    description: string;
    instructions?: string;
  } | undefined;
  requestPermission(
    toolName: string,
    preview: string,
    args: unknown,
    context: { agentId: string; toolCallId?: string },
  ): Promise<PermissionPromptResult>;
  publish(event: HarnessEvent): void;
}

export class AgentRuntimeCoordinator {
  constructor(private readonly options: AgentRuntimeCoordinatorOptions) {}

  availableToolNames(extraNames: readonly string[] = []): string[] {
    return [...new Set([
      ...this.options.drivers.getAllTools().map((tool) => tool.name),
      "skill",
      ...extraNames,
    ])];
  }

  async refreshMain(
    mainAgentId: string,
    extraNames: readonly string[] = [],
  ): Promise<void> {
    await this.options.supervisor().updateMainCapabilities(
      mainAgentId,
      this.availableToolNames(extraNames),
    );
  }

  create(
    application: AgentApplicationSnapshot,
    context: AgentContext,
    agentId: string,
  ): AgentProcessRuntime {
    let modelSelection: { model: Model<Api>; apiKey?: string };
    try {
      modelSelection = this.resolveApplicationModel(application);
    } catch (error) {
      if (
        error instanceof AgentRuntimeFailure
        && application.fallback?.some((fallback) =>
          fallback.on.includes(error.code)
        )
      ) {
        return new FailedAgentRuntime(error);
      }
      throw error;
    }

    const config = this.options.config();
    const model = modelSelection.model;
    const childContextManager = new ContextManager(config.context);
    childContextManager.updateModel(model.contextWindow, model.maxTokens);
    const processTools = makeAgentProcessTools(
      this.options.supervisor(),
      agentId,
    );
    const toolsByName = new Map<string, AgentTool<any>>();
    for (const tool of [
      ...this.options.drivers.getAllTools(),
      this.options.skillTool(),
      ...processTools,
    ]) {
      toolsByName.set(tool.name, tool);
    }
    const allowed = new Set(context.allowedTools);
    const tools = [...toolsByName.values()].filter((tool) =>
      allowed.has(tool.name)
    );
    const acceptEditRules = application.permissionMode === "acceptEdits"
      ? ["write_file", "overwrite_file", "edit", "edit_undo"].map((tool) => ({
          tool,
          decision: "allow" as const,
          priority: 100,
        }))
      : [];
    const childPermissions = new PermissionManager(
      {
        ...config.permissions,
        rules: [...acceptEditRules, ...config.permissions.rules],
        defaultDecision: application.permissionMode === "bypassPermissions"
          ? "allow"
          : context.attachment === "background"
          ? "deny"
          : config.permissions.defaultDecision,
      },
      async (toolName, preview, args, promptContext) => {
        const toolCallId = promptContext?.toolCallId;
        this.options.publish({
          type: "agent:progress",
          agentId,
          phase: "permission",
          message: `Permission required for ${toolName}`,
          details: {
            kind: "permission",
            status: "waiting",
            executionId: agentId,
            toolCallId,
            toolName,
            preview,
          },
        });
        try {
          return await this.options.requestPermission(
            toolName,
            preview,
            args,
            { agentId, toolCallId },
          );
        } finally {
          this.options.publish({
            type: "agent:progress",
            agentId,
            phase: "permission",
            message: `Permission resolved for ${toolName}`,
            details: {
              kind: "permission",
              status: "resolved",
              executionId: agentId,
              toolCallId,
              toolName,
            },
          });
        }
      },
      undefined,
    );
    const backgroundPermissions = new PermissionManager(
      {
        ...config.permissions,
        rules: [...acceptEditRules, ...config.permissions.rules],
        defaultDecision: application.permissionMode === "bypassPermissions"
          ? "allow"
          : "deny",
      },
      () => Promise.resolve({
        decision: "deny",
        denyReason: "Background Agent processes cannot open permission prompts",
      }),
      undefined,
    );
    const thinkingLevel = this.resolveThinkingLevel(application, config);
    const applicationMemory = loadAgentMemory(
      application,
      config.configDir,
      context.worktree?.repositoryRoot ?? config.projectPath,
    );
    const applicationSkills = this.buildApplicationSkills(application);
    const child = new PiAgentRuntime({
      initialState: {
        systemPrompt: [
          application.systemPrompt,
          `# Runtime Context\n\nAgent ID: ${agentId}\nParent session: ${context.parentSessionId}\nWorking directory: ${context.cwd}`,
          applicationSkills,
          applicationMemory,
        ].filter(Boolean).join("\n\n"),
        model,
        tools,
        thinkingLevel,
      },
      streamFn: (
        runtimeModel: Model<Api>,
        runtimeContext: Context,
        streamOptions?: SimpleStreamOptions,
      ) => streamSimple(runtimeModel, runtimeContext, {
        ...streamOptions,
        apiKey: streamOptions?.apiKey ?? modelSelection.apiKey,
        maxTokens: config.maxTokens,
        timeoutMs: 120_000,
        maxRetries: config.retry.maxRetries,
        maxRetryDelayMs: config.retry.maxDelayMs,
      }),
      transformContext: (messages, signal) =>
        childContextManager.transform(
          messages,
          signal,
        ) as Promise<AgentMessage[]>,
      beforeToolCall: async (toolContext, signal) => {
        const currentContext = this.options.supervisor().get(agentId)?.context
          ?? context;
        const capability = checkAgentCapability(
          currentContext,
          toolContext.toolCall.name,
          toolContext.args,
        );
        const permissions = currentContext.attachment === "background"
          ? backgroundPermissions
          : childPermissions;
        return capability ?? await permissions.check(toolContext, signal);
      },
      afterToolCall: async (_toolContext, signal) =>
        signal?.aborted ? { terminate: true } : undefined,
    });
    if (application.maxTurns) {
      let turns = 0;
      child.subscribe((event) => {
        if (event.type === "turn_end" && ++turns >= application.maxTurns!) {
          child.abort();
        }
      });
    }
    return new PiAgentRuntimeAdapter(child, agentId);
  }

  private buildApplicationSkills(
    application: AgentApplicationSnapshot,
  ): string {
    if (!application.skills?.length) return "";
    const sections = application.skills.map((name) => {
      const manifest = this.options.skillManifest(name);
      if (!manifest) {
        throw new Error(`Unknown Skill in ${application.name}: ${name}`);
      }
      return [
        `## Skill: ${manifest.name}`,
        manifest.description,
        manifest.instructions ?? "",
      ].filter(Boolean).join("\n\n");
    });
    return ["# Application Skills", ...sections].join("\n\n");
  }

  private resolveApplicationModel(
    application: AgentApplicationSnapshot,
  ): { model: Model<Api>; apiKey?: string } {
    const config = this.options.config();
    let configured = application.model;
    if (configured && ["haiku", "sonnet", "opus"].includes(configured)) {
      configured = config.agentModelAliases?.[
        configured as "haiku" | "sonnet" | "opus"
      ];
    }
    if (!configured || configured === "inherit") {
      return {
        model: this.resolveSubagentModel(config.provider, config.modelId),
        apiKey: config.apiKey,
      };
    }
    if (configured === "vision") {
      const vision = resolveVisionApplicationConfig(application, config);
      if (!vision?.provider || !vision.model) {
        throw new AgentRuntimeFailure(
          "model_unavailable",
          "Vision model is not configured",
        );
      }
      return {
        model: this.resolveSubagentModel(vision.provider, vision.model),
        apiKey: vision.key ?? getEnvApiKey(
          vision.provider,
          this.options.environment,
        ),
      };
    }
    const separator = configured.indexOf("/");
    if (separator > 0) {
      const provider = configured.slice(0, separator);
      return {
        model: this.resolveSubagentModel(
          provider,
          configured.slice(separator + 1),
        ),
        apiKey: provider === config.provider
          ? config.apiKey
          : provider === config.vision?.provider
          ? config.vision.key ?? getEnvApiKey(
              provider,
              this.options.environment,
            )
          : getEnvApiKey(provider, this.options.environment),
      };
    }
    return {
      model: this.resolveSubagentModel(config.provider, configured),
      apiKey: config.apiKey,
    };
  }

  private resolveSubagentModel(provider: string, modelId: string): Model<Api> {
    try {
      return resolveModel(provider, modelId);
    } catch (error) {
      throw new AgentRuntimeFailure(
        "model_unavailable",
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    }
  }

  private resolveThinkingLevel(
    application: AgentApplicationSnapshot,
    config: RuntimeConfig,
  ): RuntimeConfig["thinkingLevel"] {
    if (typeof application.effort === "number") {
      if (application.effort <= 0) return "off";
      if (application.effort <= 0.33) return "low";
      if (application.effort <= 0.66) return "medium";
      return "high";
    }
    if (
      typeof application.effort === "string"
      && ["off", "minimal", "low", "medium", "high", "xhigh", "max"]
        .includes(application.effort)
    ) {
      return application.effort as RuntimeConfig["thinkingLevel"];
    }
    return config.thinkingLevel;
  }
}
