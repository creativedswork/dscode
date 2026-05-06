import { Agent } from "@mariozechner/pi-agent-core";
import { getModel, streamSimple } from "@mariozechner/pi-ai";

import type { HarnessConfig } from "./types.js";
import { SessionManager } from "../session/manager.js";
import { ContextManager } from "../context/manager.js";
import { MemoryManager } from "../memory/manager.js";
import { SkillRegistry } from "../skills/registry.js";
import { PermissionManager } from "../permissions/manager.js";
import { TerminalRenderer } from "../ui/render.js";
import { runRepl, promptPermission } from "../ui/repl.js";

export class Harness {
  private agent!: Agent;
  private sessionManager: SessionManager;
  private contextManager: ContextManager;
  private memoryManager: MemoryManager;
  private skillRegistry: SkillRegistry;
  private permissionManager: PermissionManager;
  private renderer: TerminalRenderer;
  private config: HarnessConfig;

  constructor(config: HarnessConfig) {
    this.config = config;
    this.renderer = new TerminalRenderer();
    this.sessionManager = new SessionManager(config.dataDir);
    this.contextManager = new ContextManager(config.context);
    this.memoryManager = new MemoryManager(config.dataDir, config.projectPath, config.memory);
    this.skillRegistry = new SkillRegistry();
    this.permissionManager = new PermissionManager(config.permissions, promptPermission);
  }

  initialize(): void {
    // activate configured skills
    for (const name of this.config.skills) {
      try {
        this.skillRegistry.activateSkill(name);
      } catch {
        // skip unknown skills silently
      }
    }

    // build system prompt
    const memories = this.memoryManager.getRelevantMemories();
    const skillAdditions = this.skillRegistry.getSystemPromptAdditions();
    const systemPrompt = this.buildSystemPrompt(memories, skillAdditions);

    // get model
    const model = getModel(this.config.provider as any, this.config.modelId as any);

    // update context manager with model limits
    this.contextManager.updateModel(model.contextWindow, model.maxTokens);

    // create agent
    this.agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools: this.skillRegistry.getTools(),
        thinkingLevel: this.config.thinkingLevel as any,
      },
      streamFn: streamSimple,
      transformContext: (msgs: any, signal?: AbortSignal) => this.contextManager.transform(msgs, signal) as any,
      beforeToolCall: (ctx: any, signal?: AbortSignal) => this.permissionManager.check(ctx, signal) as any,
    });

    // bind event rendering
    this.bindEvents();

    // create session
    this.sessionManager.createSession(this.config.provider, this.config.modelId);
  }

  async run(): Promise<void> {
    const model = getModel(this.config.provider as any, this.config.modelId as any);
    await runRepl({
      agent: this.agent,
      sessionManager: this.sessionManager,
      memoryManager: this.memoryManager,
      skillRegistry: this.skillRegistry,
      permissionManager: this.permissionManager,
      contextManager: this.contextManager,
      renderer: this.renderer,
      modelName: model.name,
    });
    this.shutdown();
  }

  private shutdown(): void {
    this.sessionManager.saveSession(this.agent);
  }

  private buildSystemPrompt(memories: string, skillAdditions: string): string {
    let prompt = `You are a helpful assistant working in: ${this.config.projectPath}

Use tools when they help accomplish the user's request.
Answer in the user's language. Be concise and direct.`;

    if (skillAdditions) {
      prompt += "\n\n" + skillAdditions;
    }
    if (memories) {
      prompt += memories;
    }
    return prompt;
  }

  private bindEvents(): void {
    this.agent.subscribe((event) => {
      switch (event.type) {
        case "message_update": {
          const ev = (event as any).assistantMessageEvent;
          if (!ev) break;
          switch (ev.type) {
            case "thinking_start":
              this.renderer.renderThinkingStart();
              break;
            case "thinking_delta":
              this.renderer.renderThinkingDelta(ev.delta);
              break;
            case "thinking_end":
              this.renderer.renderThinkingEnd();
              break;
            case "text_delta":
              this.renderer.renderTextDelta(ev.delta);
              break;
          }
          break;
        }
        case "tool_execution_start":
          this.renderer.renderToolStart((event as any).toolName, (event as any).args);
          break;
        case "tool_execution_end":
          this.renderer.renderToolEnd(
            (event as any).toolName,
            (event as any).result,
            (event as any).isError,
          );
          break;
      }
    });

    // auto-save session on agent_end
    this.agent.subscribe((event) => {
      if (event.type === "agent_end") {
        this.sessionManager.saveSession(this.agent);
      }
    });
  }
}
