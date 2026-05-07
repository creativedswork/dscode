import {
  ProcessTerminal,
  TUI,
  Box,
  Text,
  TruncatedText,
  Editor,
  CancellableLoader,
  CombinedAutocompleteProvider,
  matchesKey,
  Key,
  decodeKittyPrintable,
} from "@earendil-works/pi-tui";

import type { Agent } from "@mariozechner/pi-agent-core";
import type { SessionManager } from "../session/manager.js";
import type { MemoryManager } from "../memory/manager.js";
import type { DriverRegistry } from "../drivers/registry.js";
import type { SkillManager } from "../skills/manager.js";
import type { PermissionManager } from "../permissions/manager.js";
import type { ContextManager } from "../context/manager.js";
import { c, editorTheme, TIPS, randomTip } from "./theme.js";
import { ConversationView } from "./conversation.js";
import { getSlashCommandAutocomplete, executeSlashCommand } from "./commands.js";

export interface TuiDeps {
  agent: Agent;
  sessionManager: SessionManager;
  memoryManager: MemoryManager;
  driverRegistry: DriverRegistry;
  skillManager: SkillManager;
  permissionManager: PermissionManager;
  contextManager: ContextManager;
  modelName: string;
  projectPath: string;
}

export class TuiApp {
  private deps: TuiDeps;
  private terminal: ProcessTerminal;
  private tui: TUI;
  private conversation: ConversationView;
  private editor: Editor;
  private loader: CancellableLoader;
  private loaderOverlayHandle: ReturnType<TUI["showOverlay"]> | null = null;
  private processing = false;
  private resolvePermission:
    | ((result: { decision: "allow" | "deny"; rememberForSession: boolean }) => void)
    | null = null;
  private permissionOverlayHandle: ReturnType<TUI["showOverlay"]> | null = null;
  private lastCtrlC = 0;
  private idleStartTime = 0;
  private lastActivityTime = 0;
  private waitSegments: number[] = [];
  private totalWaitMs = 0;
  private idleTimer?: ReturnType<typeof setInterval>;

  constructor(deps: TuiDeps) {
    this.deps = deps;
    this.terminal = new ProcessTerminal();
    this.tui = new TUI(this.terminal, true);
    this.conversation = new ConversationView(this.tui);

    this.loader = new CancellableLoader(this.tui, c.cyan, c.dim, "Thinking...");

    const autocomplete = new CombinedAutocompleteProvider(
      getSlashCommandAutocomplete(),
      deps.projectPath,
      null,
    );

    this.editor = new Editor(this.tui, editorTheme, { paddingX: 1 });
    this.editor.setAutocompleteProvider(autocomplete);
    this.editor.onSubmit = (text) => this.handleSubmit(text.trim());

    this.tui.addInputListener((data) => {
      if (this.handleInput(data)) {
        return { consume: true };
      }
      return undefined;
    });

    this.loader.onAbort = () => {
      deps.agent.abort();
    };

    this.buildLayout();
  }

  private buildLayout(): void {
    const root = new Box(1);
    root.addChild(new TruncatedText(c.bold("DSCode ") + c.dim(`· ${this.deps.modelName}`), 1));
    root.addChild(this.conversation.component);
    this.tui.addChild(root);
    this.tui.addChild(this.editor);
  }

  getPromptPermission(): (
    toolName: string,
    preview: string,
  ) => Promise<{ decision: "allow" | "deny"; rememberForSession: boolean }> {
    return (toolName, preview) => this.showPermissionPrompt(toolName, preview);
  }

  private showPermissionPrompt(
    toolName: string,
    preview: string,
  ): Promise<{ decision: "allow" | "deny"; rememberForSession: boolean }> {
    return new Promise((resolve) => {
      this.resolvePermission = resolve;

      const lines: string[] = [];
      lines.push(c.yellow("┌─ Permission ─────────────────────────────"));
      lines.push(c.yellow("│") + " Tool: " + c.bold(toolName));
      for (const line of preview.split("\n")) {
        lines.push(c.yellow("│") + " " + line);
      }
      lines.push(c.yellow("└───────────────────────────────────────────"));
      lines.push(
        "  [" + c.green("Y") + "]es  [" + c.red("N") + "]o  [" + c.cyan("A") + "]lways  " + c.dim("(Esc to deny)"),
      );

      const box = new Box(1, 1);
      box.addChild(new Text(lines.join("\n"), 0, 0));

      this.permissionOverlayHandle = this.tui.showOverlay(box, {
        anchor: "top-center",
        offsetY: 2,
        width: "60%",
        minWidth: 40,
      });
    });
  }

  private resolvePermissionChoice(decision: "allow" | "deny", rememberForSession = false): void {
    if (this.resolvePermission) {
      this.resolvePermission({ decision, rememberForSession });
      this.resolvePermission = null;
    }
    if (this.permissionOverlayHandle) {
      this.permissionOverlayHandle.hide();
      this.permissionOverlayHandle = null;
    }
  }

  private handleInput(data: string): boolean {
    if (this.resolvePermission) {
      if (matchesKey(data, Key.escape)) {
        this.resolvePermissionChoice("deny");
        return true;
      }
      const ch = decodeKittyPrintable(data)?.[0] ?? data[0];
      if (!ch) return true;
      switch (ch.toLowerCase()) {
        case "y":
          this.resolvePermissionChoice("allow");
          return true;
        case "n":
          this.resolvePermissionChoice("deny");
          return true;
        case "a":
          this.resolvePermissionChoice("allow", true);
          return true;
        default:
          return true;
      }
    }

    if (this.processing) {
      if (matchesKey(data, Key.escape) || matchesKey(data, Key.tab)) {
        this.deps.agent.abort();
        this.conversation.addInfo("(aborted)");
        return true;
      }
    } else {
      if (matchesKey(data, "ctrl+c")) {
        const now = Date.now();
        if (now - this.lastCtrlC < 500) {
          this.stop();
          return true;
        }
        this.lastCtrlC = now;
        this.conversation.addInfo("Press Ctrl+C again to exit");
        return true;
      }
    }

    return false;
  }

  addUserMessage(text: string): void {
    this.conversation.addUserMessage(text);
  }

  startAssistantMessage(): void {
    this.conversation.startAssistantMessage();
  }

  thinkingDelta(delta: string): void {
    this.conversation.thinkingDelta(delta);
  }

  textDelta(delta: string): void {
    this.markActivity();
    this.conversation.textDelta(delta);
  }

  toolStart(name: string, args: unknown): void {
    this.markActivity();
    this.conversation.toolStart(name, args);
  }

  toolEnd(name: string, result: unknown, isError: boolean): void {
    this.markActivity();
    this.conversation.toolEnd(name, result, isError);
  }

  finishAssistantMessage(): void {
    this.finalizeIdleSegment();
    this.conversation.finishAssistantMessage();
    if (this.totalWaitMs >= 1000) {
      this.conversation.addInfo(
        c.dim(`⏱ total wait: ${this.formatElapsed(this.totalWaitMs)} (${this.waitSegments.length} segment${this.waitSegments.length > 1 ? "s" : ""})`),
      );
    }
    this.conversation.addInfo(c.dim(randomTip()));
  }

  addInfo(text: string): void {
    this.conversation.addInfo(text);
  }

  addError(text: string): void {
    this.conversation.addError(text);
  }

  setProcessing(processing: boolean): void {
    this.processing = processing;
    this.editor.disableSubmit = processing;
    if (processing) {
      this.idleStartTime = 0;
      this.lastActivityTime = Date.now();
      this.waitSegments = [];
      this.totalWaitMs = 0;
      this.idleTimer = setInterval(() => {
        if (!this.processing) return;
        const idleDuration = Date.now() - this.lastActivityTime;
        if (idleDuration >= 1000 && !this.idleStartTime) {
          this.idleStartTime = this.lastActivityTime;
        }
      }, 500);
      this.loader.start();
      this.loaderOverlayHandle = this.tui.showOverlay(this.loader, {
        anchor: "bottom-left",
        offsetX: 2,
        offsetY: -3,
        nonCapturing: true,
      });
    } else {
      if (this.idleTimer) {
        clearInterval(this.idleTimer);
        this.idleTimer = undefined;
      }
      this.finalizeIdleSegment();
      this.loader.stop();
      if (this.loaderOverlayHandle) {
        this.loaderOverlayHandle.hide();
        this.loaderOverlayHandle = null;
      }
    }
    this.tui.requestRender(true);
  }

  private markActivity(): void {
    this.lastActivityTime = Date.now();
  }

  private finalizeIdleSegment(): void {
    if (this.idleStartTime) {
      const segmentMs = Date.now() - this.idleStartTime;
      if (segmentMs >= 200) {
        this.waitSegments.push(segmentMs);
        this.totalWaitMs += segmentMs;
      }
      this.idleStartTime = 0;
    }
  }

  private formatElapsed(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 60) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }

  private handleSubmit(text: string): void {
    if (this.processing) return;
    if (!text) return;

    this.editor.setText("");

    if (text.startsWith("/")) {
      executeSlashCommand(text, this.deps, this);
      return;
    }

    if (text === "exit" || text === "quit") {
      this.stop();
      return;
    }

    this.addUserMessage(text);
    this.setProcessing(true);
    this.deps.agent.prompt(text).then(
      () => {
        this.setProcessing(false);
      },
      (err) => {
        this.setProcessing(false);
        this.addError(err instanceof Error ? err.message : String(err));
      },
    );
  }

  async start(): Promise<void> {
    this.terminal.setTitle("DSCode");
    this.tui.start();
    this.tui.setFocus(this.editor);
  }

  stop(): void {
    this.terminal.write("\n" + c.dim("Goodbye.\n"));
    this.tui.stop();
  }
}
