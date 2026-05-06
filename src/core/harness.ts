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
  private _truncated = false;

  constructor(config: HarnessConfig) {
    this.config = config;
    this.renderer = new TerminalRenderer();
    this.sessionManager = new SessionManager(config.dataDir);
    this.contextManager = new ContextManager(config.context);
    this.memoryManager = new MemoryManager(config.dataDir, config.projectPath, config.memory);
    this.skillRegistry = new SkillRegistry(config.userSkillsDir, config.projectSkillsDir);
    this.permissionManager = new PermissionManager(config.permissions, promptPermission, () => {
      this.renderer.pauseSpinner();
    });
  }

  initialize(): void {
    // activate configured external skills
    for (const name of this.config.skills) {
      try {
        this.skillRegistry.activateSkill(name);
      } catch {
        // skip unknown skills silently
      }
    }

    // build system prompt
    const memories = this.memoryManager.getRelevantMemories();
    const skillSection = this.skillRegistry.getSystemPromptSection();
    const systemPrompt = this.buildSystemPrompt(memories, skillSection);

    // get model
    const model = getModel(this.config.provider as any, this.config.modelId as any);

    // update context manager with model limits
    this.contextManager.updateModel(model.contextWindow, model.maxTokens);

    // create agent
    const maxTokens = this.config.maxTokens;
    this.agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools: this.skillRegistry.getTools(),
        thinkingLevel: this.config.thinkingLevel as any,
      },
      streamFn: (m: any, ctx: any, opts?: any) => streamSimple(m, ctx, { ...opts, maxTokens }),
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
      harness: this,
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
    this.renderer.stopStreaming();
    this.sessionManager.saveSession(this.agent);
  }

  get wasTruncated(): boolean {
    return this._truncated;
  }

  resetTruncated(): void {
    this._truncated = false;
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
    if (memories) {
      prompt += memories;
    }
    return prompt;
  }

  startSpinner(): void {
    this.renderer.startStreaming();
  }

  stopSpinner(): void {
    this.renderer.stopStreaming();
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
          this.renderer.pauseSpinner();
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
      if (event.type === "turn_end") {
        const msg = (event as any).message;
        if (msg?.stopReason === "length") {
          this._truncated = true;
        }
      }
    });
  }
}
