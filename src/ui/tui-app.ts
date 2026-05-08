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
import type { ImageContent } from "@mariozechner/pi-ai";
import type { SessionManager } from "../session/manager.js";
import type { MemoryManager } from "../memory/manager.js";
import type { DriverRegistry } from "../drivers/registry.js";
import type { SkillManager } from "../skills/manager.js";
import type { PermissionManager } from "../permissions/manager.js";
import type { ContextManager } from "../context/manager.js";
import { c, editorTheme, TIPS, randomTip } from "./theme.js";
import { ConversationView } from "./conversation.js";
import { getSlashCommandAutocomplete, executeSlashCommand } from "./commands.js";
import { readClipboardImageNonBlocking } from "../utils/image.js";
import { ocrImages } from "../utils/ocr.js";
import type { OcrResult } from "../utils/ocr.js";

export interface TuiDeps {
  agent: Agent;
  sessionManager: SessionManager;
  memoryManager: MemoryManager;
  driverRegistry: DriverRegistry;
  skillManager: SkillManager;
  permissionManager: PermissionManager;
  contextManager: ContextManager;
  modelName: string;
  modelSupportsImages: boolean;
  modelNeedsOcr?: boolean;
  projectPath: string;
}

export class TuiApp {
  private deps: TuiDeps;
  private terminal: ProcessTerminal;
  private tui: TUI;
  private conversation: ConversationView;
  private editor: Editor;
  private imageStatus: Text;
  private loader: CancellableLoader;
  private loaderOverlayHandle: ReturnType<TUI["showOverlay"]> | null = null;
  private processing = false;
  private lastCtrlCPress = 0;
  private ctrlCDebounceUntil = 0;
  private resolvePermission:
    | ((result: { decision: "allow" | "deny"; rememberForSession: boolean }) => void)
    | null = null;
  private idleStartTime = 0;
  private lastActivityTime = 0;
  private waitSegments: number[] = [];
  private totalWaitMs = 0;
  private idleTimer?: ReturnType<typeof setInterval>;
  private tipDuration = 0;
  private showTip = false;
  private exitPromise!: Promise<void>;
  private exitResolve!: () => void;
  private stopping = false;
  private pendingImages: ImageContent[] = [];

  constructor(deps: TuiDeps) {
    this.deps = deps;
    this.terminal = new ProcessTerminal();
    this.tui = new TUI(this.terminal, true);
    this.conversation = new ConversationView(this.tui);
    this.imageStatus = new Text("");

    this.loader = new CancellableLoader(this.tui, c.cyan, c.dim, "Waiting...");

    const autocomplete = new CombinedAutocompleteProvider(
      getSlashCommandAutocomplete(),
      deps.projectPath,
      null,
    );

    this.editor = new Editor(this.tui, editorTheme, { paddingX: 1 });
    this.editor.setAutocompleteProvider(autocomplete);
    this.editor.onSubmit = (text) => this.handleSubmit(text.trim());
    this.editor.onChange = (text) => {
      const match = text.match(/\[paste #\d+ (\+[\d]+ lines|[\d]+ chars)\]/);
      if (match) {
        this.conversation.addInfo(c.dim(`Large paste accepted — ${match[0]}. Press Enter to submit full content.`));
      }
    };

    this.tui.addInputListener((data) => {
      if (this.handlePasteImage(data)) {
        return { consume: true };
      }
      if (this.handleInput(data)) {
        return { consume: true };
      }
      return undefined;
    });

    process.on("SIGINT", () => this.handleCtrlC());

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
    this.tui.addChild(this.imageStatus);
    this.tui.addChild(this.editor);
  }

  getPromptPermission(): (
    toolName: string,
    preview: string,
  ) => Promise<{ decision: "allow" | "deny"; rememberForSession: boolean }> {
    return (toolName, preview) => this.showPermissionPrompt(toolName, preview);
  }

  private async showPermissionPrompt(
    toolName: string,
    preview: string,
  ): Promise<{ decision: "allow" | "deny"; rememberForSession: boolean }> {
    this.conversation.showPermissionPrompt(toolName, preview);
    return new Promise((resolve) => {
      this.resolvePermission = resolve;
    });
  }

  private resolvePermissionChoice(decision: "allow" | "deny", rememberForSession = false): void {
    if (this.resolvePermission) {
      this.resolvePermission({ decision, rememberForSession });
      this.resolvePermission = null;
    }
    this.conversation.clearPermissionPrompt();
    this.conversation.addInfo(
      c.dim(`Permission: ${decision === "allow" ? c.green("allowed") : c.red("denied")}${rememberForSession ? c.dim(" (always)") : ""}`),
    );
    this.tui.requestRender(true);
  }

  private handleInput(data: string): boolean {
    if (this.resolvePermission) {
      if (matchesKey(data, Key.up)) {
        this.conversation.permNavigate(-1);
        return true;
      }
      if (matchesKey(data, Key.down)) {
        this.conversation.permNavigate(1);
        return true;
      }
      if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
        const sel = this.conversation.permSelect();
        if (sel) {
          if (sel.value === "deny") {
            this.resolvePermissionChoice("deny");
          } else {
            this.resolvePermissionChoice("allow", sel.value === "always_allow");
          }
        }
        return true;
      }
      if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c") || data === "\x03") {
        this.resolvePermissionChoice("deny");
        return true;
      }
      if (data === "a" || data === "A") {
        this.resolvePermissionChoice("allow", true);
        return true;
      }
      return true;
    }

    if (this.processing) {
      if (matchesKey(data, Key.escape) || matchesKey(data, Key.tab)) {
        this.deps.agent.abort();
        this.conversation.addInfo("(aborted)");
        return true;
      }
      if (matchesKey(data, "ctrl+c") || data === "\x03") {
        this.handleCtrlC();
        return true;
      }
    } else {
      if (matchesKey(data, "ctrl+c") || data === "\x03") {
        this.handleCtrlC();
        return true;
      }
    }

    return false;
  }

  private handlePasteImage(data: string): boolean {
    // Detect empty bracketed paste (possible image paste)
    const m = data.match(/^\x1b\[200~([\s\S]*?)\x1b\[201~$/);
    if (!m) return false;

    const pasteContent = m[1];
    // Only intercept if paste content is empty or contains non-printable data
    if (pasteContent.trim() !== "" && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(pasteContent)) {
      return false;
    }

    readClipboardImageNonBlocking().then((img) => {
      if (img) {
        this.pendingImages.push(img);
        this.updateImageStatus();
        this.conversation.addInlineImage(img.data, img.mimeType);
        if (!this.deps.modelSupportsImages) {
          this.conversation.addInfo(
            c.yellow(`${this.deps.modelName} does not support image input.`),
          );
        }
      }
    });

    return true;
  }

  private handleCtrlC(): void {
    if (this.resolvePermission) {
      this.resolvePermissionChoice("deny");
      return;
    }

    if (this.processing) {
      this.deps.agent.abort();
      this.conversation.addInfo("(aborted)");
      return;
    }

    const now = Date.now();
    if (now < this.ctrlCDebounceUntil) return;

    if (now - this.lastCtrlCPress < 600) {
      this.stop();
      return;
    }

    this.lastCtrlCPress = now;
    this.ctrlCDebounceUntil = now + 150;
    this.conversation.addInfo("Press Ctrl+C again to exit");
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
        const elapsed = Date.now() - this.lastActivityTime;
        this.tipDuration += 500;
        if (this.tipDuration >= 4000) {
          this.showTip = !this.showTip;
          this.tipDuration = 0;
        }
        if (this.showTip) {
          const tips = [
            "Esc or Tab to abort",
            "Type exit to quit",
            "Ctrl+C twice to exit",
            "/help for commands",
          ];
          const tip = tips[Math.floor(Date.now() / 4000) % tips.length];
          this.loader.setMessage(`${tip}  ${c.dim(`(${this.formatElapsed(elapsed)})`)}`);
        } else {
          this.loader.setMessage(`Waiting... ${this.formatElapsed(elapsed)}`);
        }
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
      return `${totalSeconds}s`;
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

    if (this.pendingImages.length > 0 && !this.deps.modelSupportsImages) {
      this.conversation.addInfo(
        c.yellow(`${this.deps.modelName} does not support image input. Image will be omitted.`),
      );
    }

    const imageIndicator = this.pendingImages.length > 0
      ? "\n" + c.dim(`[${this.pendingImages.length} image(s) attached]`)
      : "";
    this.addUserMessage(text + imageIndicator);
    this.setProcessing(true);

    const images = this.pendingImages.length > 0 ? [...this.pendingImages] : undefined;
    this.pendingImages = [];
    this.updateImageStatus();

    if (images && this.deps.modelNeedsOcr) {
      ocrImages(images).then(
        (result: OcrResult) => {
          let promptText: string;
          if (result.hasText) {
            promptText = `${text}\n\n<image_text>\n${result.content}\n</image_text>`;
          } else {
            promptText = `${text}\n\n(用户附带了一张图片，但图片中没有可识别的文字内容)`;
          }
          this.deps.agent.prompt(promptText).then(
            () => this.setProcessing(false),
            (err) => {
              this.setProcessing(false);
              this.addError(err instanceof Error ? err.message : String(err));
            },
          );
        },
        (err) => {
          this.deps.agent.prompt(text).then(
            () => this.setProcessing(false),
            (e) => {
              this.setProcessing(false);
              this.addError(e instanceof Error ? e.message : String(e));
            },
          );
        },
      );
    } else {
      this.deps.agent.prompt(text, images).then(
        () => {
          this.setProcessing(false);
        },
        (err) => {
          this.setProcessing(false);
          this.addError(err instanceof Error ? err.message : String(err));
        },
      );
    }
  }

  async start(): Promise<void> {
    this.exitPromise = new Promise<void>((resolve) => {
      this.exitResolve = resolve;
    });
    this.terminal.setTitle("DSCode");
    this.tui.start();
    this.tui.setFocus(this.editor);
  }

  waitForExit(): Promise<void> {
    return this.exitPromise;
  }

  stop(): void {
    if (this.stopping) return;
    this.stopping = true;
    this.terminal.write("\n" + c.dim("Goodbye.\n"));
    this.tui.stop();
    this.exitResolve();
  }

  focusEditor(): void {
    this.tui.setFocus(this.editor);
  }

  addPendingImage(image: ImageContent): void {
    this.pendingImages.push(image);
    this.updateImageStatus();
  }

  private updateImageStatus(): void {
    if (this.pendingImages.length > 0) {
      const totalKB = Math.round(
        this.pendingImages.reduce((sum, img) => sum + img.data.length * 0.75, 0) / 1024,
      );
      this.imageStatus.setText(
        c.dim(` ${this.pendingImages.length} image(s) attached (${totalKB} KB)`),
      );
    } else {
      this.imageStatus.setText("");
    }
    this.tui.requestRender(true);
  }
}
