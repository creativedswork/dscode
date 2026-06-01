import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { Agent } from "@mariozechner/pi-agent-core";
import type { AfterToolCallContext, AfterToolCallResult, AgentMessage, AgentTool, BeforeToolCallContext } from "@mariozechner/pi-agent-core";
import { streamSimple, Type } from "@mariozechner/pi-ai";
import type { Api, AssistantMessage, Context, ImageContent, Model, SimpleStreamOptions } from "@mariozechner/pi-ai";

import type { HarnessConfig } from "./types.js";
import { saveUserConfig, loadScopedSettings, projectSettingsPath, userSettingsPath, normalizeTransport, normalizeProtocolVersion } from "./config.js";
import { SessionManager } from "../session/manager.js";
import { ContextManager } from "../context/manager.js";
import { MemoryManager } from "../memory/manager.js";
import { DriverRegistry } from "../drivers/registry.js";
import { ToolRegistry } from "../drivers/tool-registry.js";
import { makeDiscoveryDriver } from "../drivers/discovery.js";
import { SkillManager } from "../skills/manager.js";
import { PermissionManager } from "../permissions/manager.js";
import { MCPManager } from "../mcp/manager.js";
import type { MCPClientEvent } from "../mcp/types.js";
import { AppHostManager } from "../mcp/app/host.js";
import { inferLayout } from "../ui/mdx/inference.js";
import { TuiBackend } from "../ui/tui-backend.js";
import type { UiBackend } from "../ui/backend.js";
import type { TuiDeps } from "../ui/tui-app.js";
import { resolveModel, getThinkingLevel, getAllModels } from "../models/index.js";
import { ocrImages } from "../utils/ocr.js";
import type { OcrResult } from "../utils/ocr.js";
import { getEnvApiKey } from "@mariozechner/pi-ai";
import { ImageCache } from "../utils/image-cache.js";
import type { ImageRef, VisionMessage } from "./types.js";
import { initCheckpointSystem, shutdownCheckpointSystem } from "../checkpoint/index.js";
import { ConfigWatch } from "./config-watch.js";

export class Harness {
  agent!: Agent;
  sessionManager: SessionManager;
  private contextManager: ContextManager;
  memoryManager: MemoryManager;
  driverRegistry: DriverRegistry;
  toolRegistry: ToolRegistry;
  skillManager: SkillManager;
  permissionManager: PermissionManager;
  mcpManager?: MCPManager;
  public appHostManager?: AppHostManager;
  configStore: ConfigWatch;
  config: HarnessConfig;
  private ui!: UiBackend;
  private baseSystemPrompt = "";
  private lastMcpProgress = new Map<string, { progress?: number; total?: number; message?: string }>();
  private mcpEventUnsubscribe?: () => void;
  private shuttingDown = false;
  private turnIndex = 0;

  constructor(config: HarnessConfig) {
    this.configStore = new ConfigWatch(config);
    this.config = this.configStore.get() as HarnessConfig;
    this.sessionManager = new SessionManager(config.dataDir, config.projectPath);
    this.contextManager = new ContextManager(config.context);
    this.memoryManager = new MemoryManager(config.dataDir, config.projectPath, config.memory);
    this.driverRegistry = new DriverRegistry();
    this.toolRegistry = new ToolRegistry(this.driverRegistry);
    this.skillManager = new SkillManager(config.userSkillsDir, config.projectSkillsDir);
    this.permissionManager = new PermissionManager(
      config.permissions,
      (toolName, preview, args) => this.ui.getPromptPermission()(toolName, preview, args),
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

    // 4.2: Initialize checkpoint system for baseline hygiene
    const sessionId = this.sessionManager.getCurrentSessionId?.() ?? `session-${Date.now()}`;
    initCheckpointSystem(this.config.projectPath, sessionId);
    this.driverRegistry.register(makeDiscoveryDriver(this.toolRegistry));

    if (this.config.appHost?.enabled) {
      this.appHostManager = new AppHostManager();
      await this.appHostManager.start();
    }

    const memories = this.memoryManager.getRelevantMemories();
    const skillSection = this.skillManager.getSystemPromptSection();
    this.baseSystemPrompt = this.buildSystemPrompt(memories, skillSection);
    const systemPrompt = this.baseSystemPrompt;

    const model = resolveModel(this.config.provider, this.config.modelId);
    this.contextManager.updateModel(model.contextWindow, model.maxTokens);

    const maxTokens = this.config.maxTokens;
    const apiKey = this.config.apiKey;
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
        apiKey: opts?.apiKey ?? self.config.apiKey,
        maxTokens,
        timeoutMs: 120_000,
        maxRetries: self.config.retry.maxRetries,
        maxRetryDelayMs: self.config.retry.maxDelayMs,
      }),
      transformContext: (msgs: AgentMessage[], signal?: AbortSignal) => {
        try {
          // Update tools based on current discovery state
          self.agent.state.tools = self.toolRegistry.buildToolsForRequest();
          // Update system prompt with current deferred tools hint
          const deferredHint = self.toolRegistry.buildDeferredToolsHint();
          self.agent.state.systemPrompt = self.baseSystemPrompt + deferredHint;
          return self.contextManager.transform(msgs, signal) as Promise<AgentMessage[]>;
        } catch (err) {
          console.error("[harness] transformContext error:", err);
          // Return original messages to keep the agent loop running
          return msgs as unknown as Promise<AgentMessage[]>;
        }
      },
      beforeToolCall: (ctx: BeforeToolCallContext, signal?: AbortSignal) =>
        this.permissionManager.check(ctx, signal),
      afterToolCall: async (ctx: AfterToolCallContext, _signal?: AbortSignal) => {
        try {
          if (ctx.toolCall.name === "search_tools" && ctx.context.tools) {
            ctx.context.tools = self.toolRegistry.buildToolsForRequest();
          }
        } catch (err) {
          console.error("[harness] afterToolCall error:", err);
        }
        return undefined;
      },    });

    this.bindEvents();
    this.sessionManager.createSession(this.config.provider, this.config.modelId);
  }

  /**
   * Prompt the agent with retry logic for transient errors.
   * On success, saves the session. On failure, retries up to maxRetries
   * with exponential backoff, then saves the failed state.
   */
  async promptAndSave(text: string, images?: ImageContent[]): Promise<void> {
    const maxRetries = this.config.retry.maxRetries;
    const baseDelay = this.config.retry.baseDelayMs;
    const maxDelay = this.config.retry.maxDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const preTurnLength = (this.agent.state.messages as any[]).length;

      // On retry attempts, rollback messages and wait
      if (attempt > 0) {
        // Truncate messages to pre-turn state (removes failed assistant message)
        (this.agent.state.messages as any[]).length = preTurnLength;

        const delay = this.computeRetryDelay(attempt, baseDelay, maxDelay);
        this.ui.addRetry({
          attempt,
          maxRetries,
          delayMs: delay,
          error: "",
          level: "turn",
        });
        await this.sleep(delay);
      }

      await this.agent.prompt(text, images);

      // Check if last assistant message has an error
      const msgs = this.agent.state.messages as any[];
      const lastAssistantMsg = this.findLastAssistantMessage(msgs);

      if (!lastAssistantMsg || lastAssistantMsg.stopReason !== "error") {
        // Success — save and return
        this.sessionManager.trySaveSession(this.agent);

        return;
      }

      const errorMsg = lastAssistantMsg.errorMessage ?? "Unknown model error";

      // Non-retryable errors: auth, invalid model, etc.
      if (!this.isRetryableError(errorMsg)) {
        this.ui.addRetry({
          attempt: attempt + 1,
          maxRetries,
          delayMs: 0,
          error: errorMsg,
          level: "turn",
        });
        this.ui.addError(`Model error: ${errorMsg}`);
        this.sessionManager.trySaveSession(this.agent);

        return;
      }


      // Last retry attempt exhausted
      if (attempt >= maxRetries) {
        this.ui.addRetry({
          attempt: attempt + 1,
          maxRetries,
          delayMs: 0,
          error: errorMsg,
          level: "turn",
        });
        this.ui.addError(`Model error: ${errorMsg}`);
        this.ui.addError("✗ All retries exhausted");
        this.sessionManager.trySaveSession(this.agent);
        return;
      }

      // Will retry — show progress
      this.ui.addRetry({
        attempt: attempt + 1,
        maxRetries,
        delayMs: this.computeRetryDelay(attempt + 1, baseDelay, maxDelay),
        error: errorMsg,
        level: "turn",
      });
    }
  }

  /**
   * Force a session save immediately. Safe to call from anywhere,
   * including error handlers and shutdown hooks.
   */
  saveSessionNow(): void {
    this.sessionManager.trySaveSession(this.agent);
  }

  private findLastUserMessageIndex(messages: any[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") return i;
    }
    return -1;
  }

  private findLastAssistantMessage(messages: any[]): any | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "assistant") return messages[i];
    }
    return null;
  }

  /**
   * Determine if an error message is transient and safe to retry.
   * Permanent errors (auth, invalid model) are never retried.
   */
  private isRetryableError(errorMsg: string): boolean {
    const cfg = this.config.retry;
    const lower = errorMsg.toLowerCase();

    // Never retry auth or configuration errors
    if (
      lower.includes("authentication") ||
      lower.includes("api key") ||
      lower.includes("invalid model") ||
      lower.includes("model not found") ||
      lower.includes("permission denied") ||
      lower.includes("403") ||
      lower.includes("401")
    ) {
      return false;
    }

    // Check specific retry categories
    if (cfg.retryOnTimeout && (
      lower.includes("timeout") ||
      lower.includes("timed out") ||
      lower.includes("deadline exceeded")
    )) {
      return true;
    }

    if (cfg.retryOnRateLimit && (
      lower.includes("rate limit") ||
      lower.includes("429") ||
      lower.includes("too many requests")
    )) {
      return true;
    }

    if (cfg.retryOnServerError && (
      lower.includes("5") ||
      lower.includes("server error") ||
      lower.includes("internal") ||
      lower.includes("service unavailable") ||
      lower.includes("gateway timeout") ||
      lower.includes("bad gateway") ||
      lower.includes("terminated")
    )) {
      return true;
    }

    // Default: retry on generic connection/network errors
    if (
      lower.includes("network") ||
      lower.includes("connection") ||
      lower.includes("econnrefused") ||
      lower.includes("econnreset") ||
      lower.includes("socket") ||
      lower.includes("dns") ||
      lower.includes("eof") ||
      lower.includes("fetch failed") ||
      lower.includes("terminated")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Compute exponential backoff delay with jitter.
   * delay = min(baseDelayMs * 2^(attempt-1) + random(0, 500), maxDelayMs)
   */
  private computeRetryDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
    const jitter = Math.random() * 500;
    const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
    return Math.min(delay, maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private resolveVisionModel(): { model: Model<Api>; apiKey: string } | null {
    const v = this.config.vision;
    if (!v?.provider || !v?.model) return null;
    try {
      const model = resolveModel(v.provider, v.model);
      if (!model.input.includes("image")) {
        this.ui.addWarning(`Vision model ${v.provider}/${v.model} does not support image input — falling back to OCR.`);
        return null;
      }
      const apiKey = v.key ?? getEnvApiKey(v.provider) ?? this.config.apiKey;
      if (!apiKey) {
        this.ui.addWarning(`No API key for vision model ${v.provider}/${v.model} — configure via /config set_vision_key. Falling back to OCR.`);
        return null;
      }
      return { model, apiKey };
    } catch (err) {
      this.ui.addWarning(`Failed to resolve vision model ${v?.provider ?? "?"}/${v?.model ?? "?"}: ${err instanceof Error ? err.message : String(err)}. Falling back to OCR.`);
      return null;
    }
  }

  private async describeImagesViaVisionModel(
    images: ImageContent[],
    visionModel: Model<Api>,
    apiKey: string,
  ): Promise<string> {
    const ctx: Context = {
      systemPrompt: "You are an image description assistant. Describe the image in detail, including text, layout, and visual elements. Be thorough but concise.",
      messages: [
        { role: "user", content: [{ type: "text", text: "请详细描述这张图片的内容，包括文字、布局和视觉元素。" }, ...images], timestamp: Date.now() },
      ],
      tools: [],
    };
    const stream = streamSimple(visionModel, ctx, {
      apiKey,
      maxTokens: 4096,
      timeoutMs: 60_000,
      maxRetries: 0,
      reasoning: "off" as any,
    });
    let text = "";
    for await (const event of stream) {
      if (event.type === "text_delta") {
        text += event.delta;
      }
    }
    return text;
  }

  async promptWithImages(text: string, images: ImageContent[]): Promise<void> {
    // Normalize: ensure every image has type: "image" and proper fields
    const normalizedImages: ImageContent[] = images.map((img) => ({
      type: "image" as const,
      data: img.data ?? "",
      mimeType: img.mimeType ?? "image/png",
    }));

    // Cache images before processing
    const cachedRefs = await Promise.all(normalizedImages.map((img) => ImageCache.put(img)));
    const turnIdx = this.turnIndex++;

    // 1. Vision model configured → use it first for image description.
    //    A dedicated vision model provides better image understanding than
    //    native image support on the main model. The main model receives a
    //    text description it can always consume regardless of image support.
    const vision = this.resolveVisionModel();

    // 2. No vision model → try native image support on main model
    if (!vision) {
      const mainModel = resolveModel(this.config.provider, this.config.modelId);
      if (mainModel.input.includes("image")) {
        await this.promptAndSave(text, normalizedImages);
        return;
      }
    }

    if (vision) {
      try {
        this.ui.setProcessing(true);
        this.ui.addInfo(`Analyzing ${normalizedImages.length} image(s) with vision model (${vision.model.name})...`);
        const description = await this.describeImagesViaVisionModel(normalizedImages, vision.model, vision.apiKey);
        if (!description || description.trim().length === 0) {
          // Vision model returned empty description — fall through to OCR
          throw new Error("Vision model returned empty description");
        }
        this.ui.addInfo(`Image analysis complete, sending to main model...`);
        const enrichedText = text
          ? `${text}\n\n<image_description>\n${description}\n</image_description>`
          : `<image_description>\n${description}\n</image_description>`;

        await this.promptAndSave(enrichedText);

        // Record vision model call — capture AFTER promptAndSave so we know
        // the exact message index for session load restoration
        const msgs = this.agent.state.messages as any[];
        const msgId = this.findLastUserMessageIndex(msgs);
        const vMsg: VisionMessage = {
          turnIndex: turnIdx,
          messageIndex: msgId,
          images: cachedRefs,
          prompt: "请详细描述这张图片的内容，包括文字、布局和视觉元素。",
          description,
          modelProvider: vision.model.provider ?? this.config.vision?.provider ?? "",
          modelId: vision.model.id ?? this.config.vision?.model ?? "",
          timestamp: Date.now(),
        };
        this.sessionManager.setVisionMessages([...this.sessionManager.visionMessages, vMsg]);

        // Replace the enriched user message with original text + cached image refs.
        // The model already processed the description, but the user should see
        // their own text and the original images, not the machine-generated description.
        const msgs2 = this.agent.state.messages as any[];
        let userMsg: any = null;
        for (let i = msgs2.length - 1; i >= 0; i--) {
          if (msgs2[i]?.role === "user") {
            userMsg = msgs2[i];
            break;
          }
        }
        if (userMsg) {
          userMsg.content = text || (cachedRefs.length > 0 ? "📷 Image" : text);
          // Restore images from cache for immediate display and store refs for session persistence
          userMsg.images = cachedRefs.map((ref: ImageRef) => ({
            type: "image_ref" as const,
            hash: ref.hash,
            mimeType: ref.mimeType,
          }));
        }
        // Re-save to persist the cleaned message (promptAndSave already saved once
        // with the enriched text).
        this.sessionManager.trySaveSession(this.agent);
        // Restore images into agent state for the UI to render — reads from disk cache synchronously
        const restoredImgs: ImageContent[] = [];
        for (const ref of cachedRefs) {
          const cached = ImageCache.getSync(ref);
          if (cached) restoredImgs.push(cached);
        }
        if (restoredImgs.length > 0) {
          userMsg.images = restoredImgs.map((img) => ({
            data: img.data,
            mimeType: img.mimeType,
          }));
        }

        return;
      } catch (err) {
        this.ui.setProcessing(false);
        this.ui.addWarning(`Vision model failed: ${err instanceof Error ? err.message : String(err)}. Falling back to OCR.`);
      }
    }

    // 3. OCR fallback
    try {
      this.ui.setProcessing(true);
      this.ui.addInfo(`Extracting text from ${normalizedImages.length} image(s) with OCR...`);
      const result: OcrResult = await ocrImages(normalizedImages);
      this.ui.addInfo(`OCR complete, sending to main model...`);
      if (result.hasText) {
        const ocrText = text
          ? `${text}\n\n<image_text>\n${result.content}\n</image_text>`
          : `<image_text>\n${result.content}\n</image_text>`;
        await this.promptAndSave(ocrText);
      } else {
        const noText = text
          ? `${text}\n\n(用户附带了一张图片，但图片中没有可识别的文字内容)`
          : "(用户附带了一张图片，但图片中没有可识别的文字内容)";
        await this.promptAndSave(noText);
      }
    } catch (err) {
      this.ui.setProcessing(false);
      this.ui.addInfo(`OCR failed: ${err instanceof Error ? err.message : String(err)}. Sending text only.`);
      // If text is empty, send a fallback so the model knows about the image
      const fallbackText = text || "(用户附带了一张图片，OCR 未能识别其中内容)";
      await this.promptAndSave(fallbackText);
    }
  }

  async run(ui?: UiBackend): Promise<void> {
    if (ui) this.ui = ui;
    const model = resolveModel(this.config.provider, this.config.modelId);
    const nativeImageSupport = model.input.includes("image");
    if (!ui) {
      const tuiDeps: TuiDeps = {
        agent: this.agent,
        sessionManager: this.sessionManager,
        memoryManager: this.memoryManager,
        driverRegistry: this.driverRegistry,
        toolRegistry: this.toolRegistry,
        skillManager: this.skillManager,
        permissionManager: this.permissionManager,
        contextManager: this.contextManager,
        mcpManager: this.mcpManager,
        modelName: model.name,
        modelSupportsImages: nativeImageSupport,
        projectPath: this.config.projectPath,
        config: this.config,
        configStore: this.configStore,
        onSetModel: (id: string) => this.setModel(id),
        onSetThinking: (level: string) => this.setThinking(level),
        onSetProvider: (id: string) => this.setProvider(id),
        promptWithImages: (text: string, images: ImageContent[]) => this.promptWithImages(text, images),
        onSetCwd: (cwd: string) => this.updateProjectPath(cwd),
      };
      ui = new TuiBackend(tuiDeps);
    }
    this.ui = ui;
    // Register config change notification → UI
    this.configStore.onChange(() => {
      this.ui.onConfigChange?.();
    });

    await this.ui.start();

    try {
      if (this.config.mcp.length > 0) {
        this.ui.addInfo(`Connecting ${this.config.mcp.length} MCP server(s)...`);
        this.mcpManager = new MCPManager(this.config.mcp);
        this.mcpManager.visionResolve = () => this.resolveVisionModel();
        this.mcpManager.visionDescribe = (images: ImageContent[], model: Model<Api>, apiKey: string) => this.describeImagesViaVisionModel(images, model, apiKey);
        this.ui.setMcpManager(this.mcpManager);
        await this.mcpManager.initialize();
        this.mcpEventUnsubscribe = this.mcpManager.onEvent((event) => this.handleMcpEvent(event));
        await this.mcpManager.registerDrivers(this.driverRegistry);
        this.ui.pushMcpState?.();

        if (this.appHostManager) {
          this.appHostManager.setMcpManager(this.mcpManager);
        }

        const appOnlyNames = new Set(this.mcpManager.getAppOnlyToolNames());
        this.toolRegistry.initialize(
          this.makeSkillTool(),
          this.mcpManager.getAlwaysLoadToolNames(),
          appOnlyNames,
        );
        this.agent.state.tools = this.toolRegistry.buildToolsForRequest();
        const connected = this.mcpManager.getStates().filter((s) => s.status === "connected").length;
        const total = this.config.mcp.length;
        this.ui.addInfo(`MCP: ${connected}/${total} connected`);
        if (connected < total) {
          const errors = this.mcpManager.getStates().filter((s) => s.status === "error");
          for (const err of errors) {
            this.ui.addInfo(`MCP '${err.config.name}' failed: ${err.error ?? "unknown"}`);
          }
        }
        this.ui.focusEditor();
      } else {
        this.toolRegistry.initialize(this.makeSkillTool());
        this.agent.state.tools = this.toolRegistry.buildToolsForRequest();
      }

      if (!this.config.apiKey) {
        this.ui.addInfo([
          "Welcome to DSCode! To get started, configure your API key:",
          "",
          `  /config key your-${this.config.provider}-api-key`,
          "",
          "Then set your preferred model:",
          "",
          `  /config model ${this.config.modelId}`,
          "",
          "Type /config to see all settings.",
        ].join("\n"));
      }

      this.ui.focusEditor();
      await this.ui.waitForExit();
    } finally {
      await this.shutdown();
    }
  }

  setModel(modelId: string): void {
    const oldModelId = this.config.modelId;
    const model = resolveModel(this.config.provider, modelId);
    const thinkingLevel = getThinkingLevel(this.config.provider, modelId);
    this.configStore.setModelConfig(this.config.provider, modelId, thinkingLevel);
    this.agent.state.model = model;
    this.contextManager.updateModel(model.contextWindow, model.maxTokens);
    this.agent.state.thinkingLevel = thinkingLevel;

    saveUserConfig({ modelId, thinkingLevel });

    // Clear conversation context when switching models to avoid capability mismatch
    // (e.g. image messages from qwen -> deepseek which only supports text)
    if (oldModelId && modelId !== oldModelId) {
      this.agent.reset();
      this.ui.clearConversationView();
    }
  }


  setProvider(providerId: string): void {
    const oldProvider = this.config.provider;
    if (oldProvider === providerId) return;

    const models = getAllModels(providerId);
    if (!models || models.length === 0) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    const defaultModelId = models[0].id;
    const model = resolveModel(providerId, defaultModelId);

    this.configStore.setModelConfig(providerId, defaultModelId, getThinkingLevel(providerId, defaultModelId));
    this.agent.state.model = model;
    this.agent.state.thinkingLevel = this.config.thinkingLevel;
    this.contextManager.updateModel(model.contextWindow, model.maxTokens);

    saveUserConfig({ provider: providerId, modelId: defaultModelId, thinkingLevel: this.config.thinkingLevel });

    this.agent.reset();
    this.ui.clearConversationView();
  }
  setThinking(level: string): void {
    this.configStore.setThinkingLevel(level as any);
    this.agent.state.thinkingLevel = level as any;
    saveUserConfig({ thinkingLevel: level });
  }

  async updateProjectPath(cwd: string): Promise<{ success: boolean; error?: string }> {
    const resolvedPath = resolve(cwd);

    if (!existsSync(resolvedPath)) {
      return { success: false, error: `Path does not exist: ${resolvedPath}` };
    }

    // Save current session before switching
    this.sessionManager.trySaveSession(this.agent);

    // Change working directory
    process.chdir(resolvedPath);

    this.configStore.setProjectPath(resolvedPath);
    this.sessionManager.updateProjectPath(this.config.dataDir, resolvedPath);
    this.memoryManager.updateProjectPath(this.config.dataDir, resolvedPath);

    // Reload skills from new project directory
    const projectSkillsDir = join(resolvedPath, ".dscode", "skills");
    this.skillManager.reloadDirs(this.config.userSkillsDir, projectSkillsDir, this.driverRegistry);

    // Reload MCP servers from new project settings
    try {
      const userSettings = loadScopedSettings(userSettingsPath());
      const newProjectSettings = loadScopedSettings(projectSettingsPath(resolvedPath));
      const mergedSettings = { ...userSettings, ...newProjectSettings };

      if (this.mcpManager) {
        await this.mcpManager.shutdown();
      }

      let mcpServersRaw: unknown[] = [];
      const mcpConfig = (mergedSettings.mcp as Record<string, unknown>) ?? {};
      if (Array.isArray(mcpConfig.servers)) {
        mcpServersRaw.push(...(mcpConfig.servers as unknown[]));
      }
      const mcpObj = mergedSettings.mcpServers as Record<string, Record<string, unknown>> | undefined;
      if (mcpObj && typeof mcpObj === "object" && !Array.isArray(mcpObj)) {
        for (const [name, cfg] of Object.entries(mcpObj)) {
          if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
            mcpServersRaw.push({ name, ...cfg });
          }
        }
      }

      const mcpServers: import("../mcp/types.js").MCPServerConfig[] = mcpServersRaw
        .filter((s: any) => s && typeof s === "object")
        .map((s: any) => {
          const hasCommand = typeof s.command === "string" && s.command.length > 0;
          const hasUrl = typeof s.url === "string" && s.url.length > 0;
          const transport = normalizeTransport(s.transport ?? s.type, hasCommand, hasUrl);
          return {
            name: s.name,
            description: s.description,
            transport,
            command: s.command,
            args: s.args,
            url: s.url,
            env: s.env,
            headers: s.headers,
            preferredProtocolVersion: normalizeProtocolVersion(s.preferredProtocolVersion ?? s.protocolVersion),
            allowLegacySseFallback: s.allowLegacySseFallback !== false,
            requestTimeoutMs: typeof s.requestTimeoutMs === "number" ? s.requestTimeoutMs : undefined,
            connectTimeoutMs: typeof s.connectTimeoutMs === "number" ? s.connectTimeoutMs : undefined,
          };
        });

      if (mcpServers.length > 0) {
        this.configStore.setMcpServers(mcpServers);
        this.mcpManager = new MCPManager(mcpServers);
        this.mcpManager.visionResolve = () => this.resolveVisionModel();
        this.mcpManager.visionDescribe = (images, model, apiKey) => this.describeImagesViaVisionModel(images, model, apiKey);
        await this.mcpManager.initialize();
        await this.mcpManager.registerDrivers(this.driverRegistry);

        // Re-initialize ToolRegistry to pick up new MCP AgentTool objects
        const appOnlyNames = new Set(this.mcpManager.getAppOnlyToolNames());
        this.toolRegistry.initialize(
          this.makeSkillTool(),
          this.mcpManager.getAlwaysLoadToolNames(),
          appOnlyNames,
        );

        if (this.appHostManager) {
          this.appHostManager.setMcpManager(this.mcpManager);
        }
      } else {
        this.configStore.setMcpServers([]);
        this.mcpManager = undefined;

        // Re-initialize ToolRegistry to clear old MCP tools
        this.toolRegistry.initialize(this.makeSkillTool());
      }

      // Notify UI of updated MCP state
      this.ui.setMcpManager(this.mcpManager);
      this.ui.pushMcpState?.();
    } catch (err) {
      console.error("[harness] MCP reload error:", err);
      // Non-fatal: continue with updated path even if MCP reload fails
    }

    // Update agent tools after driver changes
    this.agent.state.tools = this.toolRegistry.buildToolsForRequest();

    // Refresh system prompt with new project memories and skills
    const memories = this.memoryManager.getRelevantMemories();
    const skillSection = this.skillManager.getSystemPromptSection();
    this.baseSystemPrompt = this.buildSystemPrompt(memories, skillSection);
    this.agent.state.systemPrompt = this.baseSystemPrompt + this.toolRegistry.buildDeferredToolsHint();

    return { success: true };
  }

  private async shutdown(): Promise<void> {
    // Save session FIRST, before any other shutdown steps.
    // This ensures data is persisted even if later steps fail.
    // Also save regardless of shuttingDown flag — this is the last chance to persist.
    this.sessionManager.trySaveSession(this.agent);

    if (this.shuttingDown) return;
    this.shuttingDown = true;

    this.mcpEventUnsubscribe?.();
    this.mcpEventUnsubscribe = undefined;
    // 4.2: Clean up checkpoint directories for this session
    try { shutdownCheckpointSystem(); } catch {}

    if (this.appHostManager) {
      try {
        await this.appHostManager.shutdown();
      } catch (err) {
        console.error("[harness] appHostManager shutdown error:", err);
      }
    }
    if (this.mcpManager) {
      try {
        await this.mcpManager.shutdown();
      } catch (err) {
        console.error("[harness] mcpManager shutdown error:", err);
      }
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
    if (this.config.agentsMdContent) {
      prompt += "\n\n" + this.config.agentsMdContent;
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




  private registeredApps = new Map<string, string>();

  private getToolResultDetails(toolResult: unknown): Record<string, unknown> | undefined {
    if (!toolResult || typeof toolResult !== "object") return undefined;
    const details = (toolResult as Record<string, unknown>).details;
    return details && typeof details === "object" ? details as Record<string, unknown> : undefined;
  }

  private getToolPayload(toolResult: unknown): unknown {
    const details = this.getToolResultDetails(toolResult);
    return details?.mcpResult ?? toolResult;
  }

  private getStructuredContent(toolResult: unknown): Record<string, unknown> | undefined {
    const payload = this.getToolPayload(toolResult);
    if (!payload || typeof payload !== "object") return undefined;
    const structuredContent = (payload as Record<string, unknown>).structuredContent;
    return structuredContent && typeof structuredContent === "object"
      ? structuredContent as Record<string, unknown>
      : undefined;
  }

  private getEffectiveToolError(toolResult: unknown, isError: boolean): boolean {
    if (isError) return true;
    const details = this.getToolResultDetails(toolResult);
    return Boolean(details?.error);
  }

  private checkAndRegisterApp(toolName: string, toolResult?: unknown): void {
    if (!this.appHostManager || !this.mcpManager) return;
    const uiInfo = this.mcpManager.getUiToolMap().get(toolName);
    if (!uiInfo) return;

    const payload = this.getToolPayload(toolResult);
    const existingAppId = this.registeredApps.get(toolName);
    if (existingAppId) {
      if (payload !== undefined) {
        this.appHostManager.pushToApp(existingAppId, {
          jsonrpc: "2.0",
          method: "ui/notifications/tool-result",
          params: payload,
        });
      }
      return;
    }

    // Try to fetch UI resource (HTML) first
    this.mcpManager.fetchUiResource(uiInfo.serverName, uiInfo.resourceUri)
      .then(({ html, csp, permissions }) => {
        const app = this.appHostManager!.registerApp({
          resourceUri: uiInfo.resourceUri,
          toolName: uiInfo.toolName,
          serverName: uiInfo.serverName,
          html,
          csp,
          permissions,
        });
        this.registeredApps.set(toolName, app.id);
        if ("addAppNotification" in this.ui) (this.ui as any).addAppNotification?.(app);
        if (payload !== undefined) {
          this.appHostManager!.pushToApp(app.id, {
            jsonrpc: "2.0",
            method: "ui/notifications/tool-result",
            params: payload,
          });
        }
      })
      .catch((err) => {
        // No HTML resource — try auto-layout inference from structuredContent
        this.ui.addInfo(`[MDX] fetchUiResource failed: ${err.message}, falling back to data mode`);
        this.registerDataModeApp(uiInfo, toolName, toolResult);
      });
  }

  private registerDataModeApp(
    uiInfo: { resourceUri: string; toolName: string; serverName: string },
    toolName: string,
    toolResult?: unknown,
  ): void {
    if (!this.appHostManager) return;

    const payload = this.getToolPayload(toolResult);
    const structuredContent = this.getStructuredContent(toolResult);
    const result = payload as Record<string, unknown> | undefined;

    if (!structuredContent) {
      this.ui.addInfo(`[MDX] no structuredContent (keys: ${result ? Object.keys(result).join(",") : "null"})`);
      return;
    }

    try {
      const layout = inferLayout(structuredContent, uiInfo.toolName);
      this.ui.addInfo(`[MDX] layout: ${layout.mdx.slice(0, 80)}...`);

      const app = this.appHostManager!.registerApp({
        resourceUri: uiInfo.resourceUri,
        toolName: uiInfo.toolName,
        serverName: uiInfo.serverName,
        mdx: layout.mdx,
        data: structuredContent,
      });
      this.registeredApps.set(toolName, app.id);
      if ("addAppNotification" in this.ui) (this.ui as any).addAppNotification?.(app);

      if (payload !== undefined) {
        this.appHostManager!.pushToApp(app.id, {
          jsonrpc: "2.0",
          method: "ui/notifications/tool-result",
          params: payload,
        });
      }
    } catch (e: any) {
      this.ui.addInfo(`[MDX] error: ${e.message}`);
    }
  }



  private bindEvents(): void {
    this.agent.subscribe((event) => {
      switch (event.type) {
        case "message_update": {
          const ev = event.assistantMessageEvent;
          if (!ev) break;
          switch (ev.type) {
            case "thinking_delta":
              this.ui.thinkingDelta(ev.delta);
              break;
            case "text_delta":
              this.ui.textDelta(ev.delta);
              break;
          }
          break;
        }
        case "tool_execution_start":
          this.ui.toolStart(event.toolName, event.args);
          break;
        case "tool_execution_update": {
          // Partial tool result: show images immediately before vision/OCR
          const payload = this.getToolPayload(event.partialResult);
          const effectiveIsError = this.getEffectiveToolError(event.partialResult, false);
          this.ui.toolEnd(event.toolName, payload, effectiveIsError);
          break;
        }
        case "tool_execution_end": {
          const payload = this.getToolPayload(event.result);
          const effectiveIsError = this.getEffectiveToolError(event.result, event.isError);
          this.ui.toolEnd(
            event.toolName,
            payload,
            effectiveIsError,
          );
          this.checkAndRegisterApp(event.toolName, event.result);
          break;
        }
      }
    });

    this.agent.subscribe(async (event) => {
      try {
        if (event.type === "agent_end") {
          this.ui.setProcessing(false);
          // Session is saved by promptAndSave after retries are resolved.
          // This save is a safety net for non-promptAndSave code paths.
          this.sessionManager.trySaveSession(this.agent);
        }
        if (event.type === "agent_start") {
          this.ui.startAssistantMessage();
        }
        if (event.type === "turn_end") {
          this.ui.finishAssistantMessage();
          const msg = event.message as AssistantMessage;
          if (msg?.stopReason === "length") {
            this.ui.addInfo("Output truncated (hit max_tokens). Continue from where you left off.");
          }
          if (msg?.stopReason === "error" && msg?.errorMessage) {
            // Don't display here — promptAndSave handles UI and retry logic.
          }
        }
      } catch (err) {
        // If the event handler fails, still try to save session
        console.error("[harness] agent event handler error:", err);
        this.sessionManager.trySaveSession(this.agent);
      }
    });
  }

  private handleMcpEvent(event: MCPClientEvent): void {
    switch (event.type) {
      case "progress": {
        const key = `${event.serverName}:${event.params.progressToken}`;
        const previous = this.lastMcpProgress.get(key);
        const next = {
          progress: event.params.progress,
          total: event.params.total,
          message: event.params.message,
        };
        this.lastMcpProgress.set(key, next);

        const shouldReport = !previous
          || event.params.message !== previous.message
          || this.isProgressComplete(event.params.progress, event.params.total)
          || this.progressBucket(event.params.progress, event.params.total) !== this.progressBucket(previous.progress, previous.total);

        if (shouldReport) {
          const summary = this.formatProgress(event.params.progress, event.params.total);
          const detail = event.params.message ? ` ${event.params.message}` : "";
          this.ui.addInfo(`MCP ${event.serverName}: ${summary}${detail}`);
        }
        return;
      }
      case "message": {
        const level = (event.params.level ?? "info").toLowerCase();
        const prefix = `MCP ${event.serverName}`;
        const text = this.stringifyMcpMessage(event.params.data);
        const label = event.params.logger ? `${event.params.logger}: ` : "";
        if (level === "error") {
          this.ui.addError(`${prefix}: ${label}${text}`);
        } else if (level === "warning" || level === "warn") {
          this.ui.addInfo(`${prefix} warning: ${label}${text}`);
        } else {
          this.ui.addInfo(`${prefix}: ${label}${text}`);
        }
        return;
      }
      case "tools_list_changed":
        this.ui.addInfo(`MCP ${event.serverName}: refreshing tool list...`);
        return;
      case "tools_refreshed":
        this.ui.addInfo(`MCP ${event.serverName}: tool list refreshed (${event.toolCount} tools)`);
        return;
      case "tools_refresh_failed":
        this.ui.addError(`MCP ${event.serverName}: tool refresh failed: ${event.error}`);
        return;
      case "resources_list_changed":
        this.ui.addInfo(`MCP ${event.serverName}: resources updated`);
        return;
      case "cancelled":
        this.ui.addInfo(`MCP ${event.serverName}: request cancelled` + (event.params.reason ? ` (${event.params.reason})` : ""));
        return;
      default:
        return;
    }
  }

  private progressBucket(progress?: number, total?: number): number {
    if (typeof progress !== "number") return -1;
    if (typeof total === "number" && total > 0) {
      return Math.min(10, Math.floor((progress / total) * 10));
    }
    return Math.floor(progress / 10);
  }

  private isProgressComplete(progress?: number, total?: number): boolean {
    if (typeof progress !== "number") return false;
    if (typeof total === "number" && total > 0) {
      return progress >= total;
    }
    return progress >= 100;
  }

  private formatProgress(progress?: number, total?: number): string {
    if (typeof progress !== "number") return "progress update";
    if (typeof total === "number" && total > 0) {
      const percent = Math.max(0, Math.min(100, Math.round((progress / total) * 100)));
      return `progress ${percent}% (${progress}/${total})`;
    }
    return `progress ${progress}`;
  }

  private stringifyMcpMessage(data: unknown): string {
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }
}
