import { Agent } from "@mariozechner/pi-agent-core";
import type { AfterToolCallContext, AfterToolCallResult, AgentMessage, AgentTool, BeforeToolCallContext } from "@mariozechner/pi-agent-core";
import { getModel, streamSimple, Type } from "@mariozechner/pi-ai";
import type { Api, AssistantMessage, Context, Model, SimpleStreamOptions } from "@mariozechner/pi-ai";

import type { HarnessConfig } from "./types.js";
import { SessionManager } from "../session/manager.js";
import { ContextManager } from "../context/manager.js";
import { MemoryManager } from "../memory/manager.js";
import { DriverRegistry } from "../drivers/registry.js";
import { ToolRegistry } from "../drivers/tool-registry.js";
import { makeDiscoveryDriver } from "../drivers/discovery.js";
import { SkillManager } from "../skills/manager.js";
import { PermissionManager } from "../permissions/manager.js";
import { MCPManager } from "../mcp/manager.js";
import { TuiApp } from "../ui/tui-app.js";

export class Harness {
  agent!: Agent;
  private sessionManager: SessionManager;
  private contextManager: ContextManager;
  private memoryManager: MemoryManager;
  private driverRegistry: DriverRegistry;
  private toolRegistry: ToolRegistry;
  private skillManager: SkillManager;
  private permissionManager: PermissionManager;
  private mcpManager?: MCPManager;
  private config: HarnessConfig;
  private tui!: TuiApp;
  private baseSystemPrompt = "";

  constructor(config: HarnessConfig) {
    this.config = config;
    this.sessionManager = new SessionManager(config.dataDir);
    this.contextManager = new ContextManager(config.context);
    this.memoryManager = new MemoryManager(config.dataDir, config.projectPath, config.memory);
    this.driverRegistry = new DriverRegistry();
    this.toolRegistry = new ToolRegistry(this.driverRegistry);
    this.skillManager = new SkillManager(config.userSkillsDir, config.projectSkillsDir);
    this.permissionManager = new PermissionManager(
      config.permissions,
      (toolName, preview) => this.tui.getPromptPermission()(toolName, preview),
      () => {},
    );
  }

  async initialize(): Promise<void> {
    for (const name of this.skillManager.listAllSkillNames()) {
      try {
        this.skillManager.activate(name, this.driverRegistry);
      } catch {
      }
    }

    for (const name of this.config.skills) {
      try {
        this.skillManager.activate(name, this.driverRegistry);
      } catch {
      }
    }

    // Register discovery driver so search_tools is available
    this.driverRegistry.register(makeDiscoveryDriver(this.toolRegistry));

    const memories = this.memoryManager.getRelevantMemories();
    const skillSection = this.skillManager.getSystemPromptSection();
    this.baseSystemPrompt = this.buildSystemPrompt(memories, skillSection);
    const systemPrompt = this.baseSystemPrompt;

    const model = (getModel as (p: string, m: string) => Model<Api>)(this.config.provider, this.config.modelId);
    this.contextManager.updateModel(model.contextWindow, model.maxTokens);

    const maxTokens = this.config.maxTokens;
    const self = this;
    this.agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools: [this.makeSkillTool()],
        thinkingLevel: this.config.thinkingLevel,
      },
      streamFn: (m: Model<Api>, ctx: Context, opts?: SimpleStreamOptions) => streamSimple(m, ctx, {
        ...opts,
        maxTokens,
        timeoutMs: 120_000,
        maxRetries: 0,
      }),
      transformContext: (msgs: AgentMessage[], signal?: AbortSignal) => {
        // Update tools based on current discovery state
        self.agent.state.tools = self.toolRegistry.buildToolsForRequest();
        // Update system prompt with current deferred tools hint
        const deferredHint = self.toolRegistry.buildDeferredToolsHint();
        self.agent.state.systemPrompt = self.baseSystemPrompt + deferredHint;
        return self.contextManager.transform(msgs, signal) as Promise<AgentMessage[]>;
      },
      beforeToolCall: (ctx: BeforeToolCallContext, signal?: AbortSignal) =>
        this.permissionManager.check(ctx, signal),
      afterToolCall: async (ctx: AfterToolCallContext, _signal?: AbortSignal) => {
        if (ctx.toolCall.name === "search_tools" && ctx.context.tools) {
          ctx.context.tools = self.toolRegistry.buildToolsForRequest();
          const deferredHint = self.toolRegistry.buildDeferredToolsHint();
          ctx.context.systemPrompt = self.baseSystemPrompt + deferredHint;
        }
        return undefined as AfterToolCallResult | undefined;
      },
    });

    this.bindEvents();
    this.sessionManager.createSession(this.config.provider, this.config.modelId);
  }

  async run(): Promise<void> {
    const model = (getModel as (p: string, m: string) => Model<Api>)(this.config.provider, this.config.modelId);
    const nativeImageSupport = model.input.includes("image");
    const needsOcr = !nativeImageSupport && this.config.provider === "deepseek";
    this.tui = new TuiApp({
      agent: this.agent,
      sessionManager: this.sessionManager,
      memoryManager: this.memoryManager,
      driverRegistry: this.driverRegistry,
      skillManager: this.skillManager,
      permissionManager: this.permissionManager,
      contextManager: this.contextManager,
      modelName: model.name,
      modelSupportsImages: nativeImageSupport || needsOcr,
      modelNeedsOcr: needsOcr,
      projectPath: this.config.projectPath,
    });

    await this.tui.start();

    if (this.config.mcp.length > 0) {
      this.tui.addInfo(`Connecting ${this.config.mcp.length} MCP server(s)...`);
      this.mcpManager = new MCPManager(this.config.mcp);
      await this.mcpManager.initialize();
      await this.mcpManager.registerDrivers(this.driverRegistry);
      this.toolRegistry.initialize(
        this.makeSkillTool(),
        this.mcpManager.getAlwaysLoadToolNames(),
      );
      this.agent.state.tools = this.toolRegistry.buildToolsForRequest();
      const connected = this.mcpManager.getStates().filter((s) => s.status === "connected").length;
      const total = this.config.mcp.length;
      this.tui.addInfo(`MCP: ${connected}/${total} connected`);
      if (connected < total) {
        const errors = this.mcpManager.getStates().filter((s) => s.status === "error");
        for (const err of errors) {
          this.tui.addInfo(`MCP '${err.config.name}' failed: ${err.error ?? "unknown"}`);
        }
      }
      this.tui.focusEditor();
    } else {
      this.toolRegistry.initialize(this.makeSkillTool());
      this.agent.state.tools = this.toolRegistry.buildToolsForRequest();
    }

    this.tui.focusEditor();
    await this.tui.waitForExit();
    await this.shutdown();
  }

  private async shutdown(): Promise<void> {
    this.sessionManager.saveSession(this.agent);
    if (this.mcpManager) {
      await this.mcpManager.shutdown();
    }
  }

  private buildSystemPrompt(memories: string, skillSection: string): string {
    let prompt = `You are a coding assistant working in: ${this.config.projectPath}

## Rules

- When the user asks you to create, modify, or delete files, you MUST call the corresponding tool (write_file, bash, etc.) immediately. Never just describe what you plan to do without actually doing it.
- Do not explain your plan before acting. Act first, then briefly explain what you did.
- If a task requires multiple tool calls, execute them one by one. Do not stop after planning.
- Answer in the user's language. Be concise and direct.
- When writing code, produce complete, working implementations. Do not leave placeholders or TODOs.`;

    if (skillSection) {
      prompt += "\n\n" + skillSection;
    }

    prompt += `\n\n## Using Skills

You have a \`skill\` tool available. When you decide to use a skill from the list above, call \`skill\` with the skill name to load its full instructions and allowed tools. Read the instructions, then follow them.

## Tool Search

You have a \`search_tools\` tool for discovering additional tools. Some tools (especially MCP tools from connected servers) are not loaded by default to save context. These tools are listed in the "Discoverable Tools" section below.

When you need a tool that is listed as discoverable but not yet in your tool list:
1. Call \`search_tools\` with keywords describing what you need
2. The matching tools will become available in your next message
3. Then call the newly loaded tools directly

You can also load tools by exact name using \`select:\`: for example \`search_tools\` with query \`select:ToolA,ToolB\`.`;

    if (memories) {
      prompt += memories;
    }
    return prompt;
  }


  private makeSkillTool(): AgentTool<typeof skillParams> {
    const skillManager = this.skillManager;

    const skillParams = Type.Object({
      name: Type.String({ description: "Name of the skill to load" }),
    });

    return {
      name: "skill",
      label: "Load skill",
      description: "Load and display the full SKILL.md content (frontmatter + instructions) for a given skill. Call this first before using a skill to understand its instructions and allowed tools.",
      parameters: skillParams,
      execute: async (_id, params) => {
        const manifest = skillManager.getManifest(params.name);
        if (!manifest) {
          return {
            content: [{ type: "text", text: `Error: skill not found: ${params.name}` }],
            details: { error: "not_found" },
          };
        }

        const lines: string[] = [];
        lines.push(`# ${manifest.name}`);
        lines.push(`Description: ${manifest.description}`);
        lines.push(`Source: ${manifest.source}`);
        if (manifest.tools && manifest.tools.length > 0) {
          lines.push(`Allowed tools: ${manifest.tools.join(", ")}`);
        } else {
          lines.push("Allowed tools: all driver tools");
        }
        if (manifest.instructions) {
          lines.push("");
          lines.push("## Instructions");
          lines.push(manifest.instructions);
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { name: manifest.name },
        };
      },
    };
  }




  private bindEvents(): void {
    this.agent.subscribe((event) => {
      switch (event.type) {
        case "message_update": {
          const ev = event.assistantMessageEvent;
          if (!ev) break;
          switch (ev.type) {
            case "thinking_delta":
              this.tui.thinkingDelta(ev.delta);
              break;
            case "text_delta":
              this.tui.textDelta(ev.delta);
              break;
          }
          break;
        }
        case "tool_execution_start":
          this.tui.toolStart(event.toolName, event.args);
          break;
        case "tool_execution_end":
          this.tui.toolEnd(
            event.toolName,
            event.result,
            event.isError,
          );
          break;
      }
    });

    this.agent.subscribe(async (event) => {
      try {
        if (event.type === "agent_end") {
          this.tui.setProcessing(false);
          this.sessionManager.saveSession(this.agent);
        }
        if (event.type === "agent_start") {
          this.tui.startAssistantMessage();
        }
        if (event.type === "turn_end") {
          this.tui.finishAssistantMessage();
          const msg = event.message as AssistantMessage;
          if (msg?.stopReason === "length") {
            this.tui.addInfo("Output truncated (hit max_tokens). Continue from where you left off.");
          }
          if (msg?.stopReason === "error" && msg?.errorMessage) {
            this.tui.addError(`Model error: ${msg.errorMessage}`);
          }
        }
      } catch (err) {
        this.tui.addError(`agent_end listener error: ${err}`);
      }
    });
  }
}
