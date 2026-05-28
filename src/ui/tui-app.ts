import {
  ProcessTerminal,
  TUI,
  Box,
  Text,
  TruncatedText,
  Editor,
  CancellableLoader,
  CombinedAutocompleteProvider,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type AutocompleteItem,
  matchesKey,
  Key,
  decodeKittyPrintable,
  hyperlink,
} from "@earendil-works/pi-tui";

import type { Agent } from "@mariozechner/pi-agent-core";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { SessionManager } from "../session/manager.js";
import type { MemoryManager } from "../memory/manager.js";
import type { DriverRegistry } from "../drivers/registry.js";
import type { ToolRegistry } from "../drivers/tool-registry.js";
import type { SkillManager } from "../skills/manager.js";
import type { PermissionManager } from "../permissions/manager.js";
import type { ContextManager } from "../context/manager.js";
import type { HarnessConfig, PermissionPromptResult, PermissionRuleConfig } from "../core/types.js";
import type { MCPManager } from "../mcp/manager.js";
import type { AppInstance } from "../mcp/app/types.js";
import { c, editorTheme } from "./theme.js";
import { ConversationView, findPermOptionByKey } from "./conversation.js";
import { getSlashCommandAutocomplete, executeSlashCommand } from "./commands.js";
import { buildMcpServers, getMcpVisibleRows, renderMcpServerList, renderMcpToolList } from "./mcp-browser.js";
import { resolveAtFileRefs, listProjectFiles } from "../utils/at-file-resolver.js";
import { readClipboardImageNonBlocking } from "../utils/image.js";
import { ocrImages } from "../utils/ocr.js";
import type { OcrResult } from "../utils/ocr.js";

export interface TuiDeps {
  agent: Agent;
  sessionManager: SessionManager;
  memoryManager: MemoryManager;
  driverRegistry: DriverRegistry;
  toolRegistry: ToolRegistry;
  skillManager: SkillManager;
  permissionManager: PermissionManager;
  contextManager: ContextManager;
  mcpManager?: MCPManager;
  modelName: string;
  modelSupportsImages: boolean;
  modelNeedsOcr?: boolean;
  projectPath: string;
  config: HarnessConfig;
  onSetModel: (modelId: string) => void;
  onSetThinking: (level: string) => void;
  onSetProvider: (providerId: string) => void;
}

type InputListenerResult = { consume?: boolean; data?: string } | undefined;

class HybridAutocompleteProvider implements AutocompleteProvider {
  private projectPath: string;
  private slashProvider: CombinedAutocompleteProvider;

  constructor(slashCommands: { name: string; description?: string }[], projectPath: string) {
    this.projectPath = projectPath;
    this.slashProvider = new CombinedAutocompleteProvider(slashCommands, projectPath, null);
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    const atMatch = textBeforeCursor.match(/(?:^|[\s])@([^\s]*)$/);
    if (atMatch) {
      const query = atMatch[1];
      const items = listProjectFiles(this.projectPath, query, 20);
      if (items.length === 0) return null;
      return {
        prefix: atMatch[0],
        items: items.map((i) => ({
          value: i.path,
          label: i.name + (i.isDir ? "/" : ""),
          description: i.path,
        })),
      };
    }

    return this.slashProvider.getSuggestions(lines, cursorLine, cursorCol, options);
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    if (prefix.startsWith("@")) {
      const currentLine = lines[cursorLine] || "";
      const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
      const afterCursor = currentLine.slice(cursorCol);
      const isDir = item.label.endsWith("/");
      const suffix = isDir ? "" : " ";
      const newLine = `${beforePrefix}${item.value}${suffix}${afterCursor}`;
      const newLines = [...lines];
      newLines[cursorLine] = newLine;
      return { lines: newLines, cursorLine, cursorCol: beforePrefix.length + item.value.length + suffix.length };
    }
    return this.slashProvider.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
  }

  shouldTriggerFileCompletion(): boolean {
    return true;
  }
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
  private mcpPanel = new Text("", 1, 0);
  private mcpPanelVisible = false;
  private mcpSelectedServerIndex: number | null = null;
  private mcpServerSelection = 0;
  private mcpServerWindowStart = 0;
  private mcpToolSelection = 0;
  private mcpToolWindowStart = 0;
  private processing = false;
  private lastCtrlCPress = 0;
  private ctrlCDebounceUntil = 0;
  private lastMenuNavDirection: "up" | "down" | null = null;
  private lastMenuNavAt = 0;
  private resolvePermission: ((result: PermissionPromptResult) => void) | null = null;
  private pendingPermissionContext:
    | { toolName: string; args: unknown }
    | null = null;
  private permissionExplainMode = false;
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
  private static readonly IMAGE_PLACEHOLDER = "[image]";
  private imagePasteInFlight = false;
  private sigintHandler = () => this.handleCtrlC();

  constructor(deps: TuiDeps) {
    this.deps = deps;
    this.terminal = new ProcessTerminal();
    this.tui = new TUI(this.terminal, true);
    this.conversation = new ConversationView(this.tui);
    this.imageStatus = new Text("");

    this.loader = new CancellableLoader(this.tui, c.cyan, c.dim, "Waiting...");

    const autocomplete = new HybridAutocompleteProvider(
      getSlashCommandAutocomplete(),
      deps.projectPath,
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
      const pasteResult = this.handlePasteImage(data);
      if (pasteResult) {
        return pasteResult;
      }
      if (this.handleInput(data)) {
        return { consume: true };
      }
      return undefined;
    });

    process.on("SIGINT", this.sigintHandler);

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
    this.tui.addChild(this.mcpPanel);
  }
  getPromptPermission(): (toolName: string,
    preview: string,
    args: unknown,
  ) => Promise<PermissionPromptResult> {
    return (toolName, preview, args) => this.showPermissionPrompt(toolName, preview, args);
  }

  setMcpManager(mcpManager?: MCPManager): void {
    this.deps.mcpManager = mcpManager;
    if (this.mcpPanelVisible) {
      this.updateMcpPanel();
    }
  }

  private async showPermissionPrompt(
    toolName: string,
    preview: string,
    args: unknown,
  ): Promise<PermissionPromptResult> {
    this.pendingPermissionContext = { toolName, args };
    this.permissionExplainMode = false;
    this.conversation.showPermissionPrompt(toolName, preview);
    return new Promise((resolve) => {
      this.resolvePermission = resolve;
    });
  }

  private resolvePermissionChoice(result: PermissionPromptResult): void {
    if (this.resolvePermission) {
      this.resolvePermission(result);
      this.resolvePermission = null;
    }
    this.pendingPermissionContext = null;
    this.permissionExplainMode = false;
    this.editor.disableSubmit = this.processing;
    this.conversation.clearPermissionPrompt();
    const suffix = result.persistRule
      ? c.dim(" (saved rule)")
      : result.rememberForSession
        ? c.dim(" (always)")
        : "";
    this.conversation.addInfo(
      c.dim(`Permission: ${result.decision === "allow" ? c.green("allowed") : c.red("denied")}${suffix}`),
    );
    this.tui.requestRender(true);
  }

  private buildPersistedRule(toolName: string, args: unknown, reason: string): PermissionRuleConfig {
    const argPattern = `^${JSON.stringify(args).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
    return {
      tool: toolName,
      argPattern,
      decision: "allow",
      reason,
      priority: 20,
    };
  }

  private canNavigateMenu(direction: "up" | "down", now = Date.now()): boolean {
    if (this.lastMenuNavDirection === direction && now - this.lastMenuNavAt < 90) {
      return false;
    }
    this.lastMenuNavDirection = direction;
    this.lastMenuNavAt = now;
    return true;
  }

  private applyPermissionOption(option: "allow" | "always_allow" | "explain" | "deny"): void {
    if (option === "deny") {
      this.resolvePermissionChoice({ decision: "deny" });
      return;
    }
    if (option === "always_allow") {
      this.resolvePermissionChoice({ decision: "allow", rememberForSession: true });
      return;
    }
    if (option === "explain") {
      this.permissionExplainMode = true;
      this.editor.disableSubmit = false;
      this.conversation.clearPermissionPrompt();
      this.conversation.addInfo(c.dim("Type your updated idea and press Enter. It will be sent back to the agent. Esc cancels."));
      this.tui.requestRender(true);
      return;
    }
    this.resolvePermissionChoice({ decision: "allow" });
  }

  private handleInput(data: string): boolean {
    if (this.permissionExplainMode) {
      if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c") || data === "\x03") {
        this.permissionExplainMode = false;
        this.pendingPermissionContext = null;
        this.editor.disableSubmit = this.processing;
        this.conversation.addInfo(c.dim("Permission explanation cancelled."));
        return true;
      }
      return false;
    }

    if (this.resolvePermission) {
      if (matchesKey(data, Key.up)) {
        if (this.canNavigateMenu("up")) {
          this.conversation.permNavigate(-1);
        }
        return true;
      }
      if (matchesKey(data, Key.down)) {
        if (this.canNavigateMenu("down")) {
          this.conversation.permNavigate(1);
        }
        return true;
      }
      if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
        const sel = this.conversation.permSelect();
        if (sel) {
          this.applyPermissionOption(sel.value);
        }
        return true;
      }
      if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c") || data === "\x03") {
        this.resolvePermissionChoice({ decision: "deny" });
        return true;
      }
      const shortcut = findPermOptionByKey(data);
      if (shortcut) {
        this.applyPermissionOption(shortcut.value);
        return true;
      }
      return true;
    }

    if (this.mcpPanelVisible) {
      return this.handleMcpBrowserInput(data);
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
      if (matchesKey(data, Key.super("v")) || matchesKey(data, Key.ctrl("v")) || data === "\x16") {
        this.pasteClipboardImage();
        return true;
      }
    }

    return false;
  }

  openMcpBrowser(): void {
    if (!this.deps.mcpManager) {
      this.addInfo("No MCP servers configured.");
      return;
    }

    const servers = this.getMcpServers();
    if (servers.length === 0) {
      this.addInfo("No MCP servers configured.");
      return;
    }

    this.mcpSelectedServerIndex = null;
    this.mcpServerSelection = 0;
    this.mcpServerWindowStart = 0;
    this.mcpToolSelection = 0;
    this.mcpToolWindowStart = 0;
    this.mcpPanelVisible = true;
    this.updateMcpPanel();
    this.tui.requestRender(true);
  }

  private closeMcpBrowser(): void {
    this.mcpPanelVisible = false;
    this.mcpPanel.setText("");
    this.mcpSelectedServerIndex = null;
    this.mcpServerSelection = 0;
    this.mcpServerWindowStart = 0;
    this.mcpToolSelection = 0;
    this.mcpToolWindowStart = 0;
    this.tui.requestRender(true);
  }

  private getMcpServers() {
    if (!this.deps.mcpManager) return [];
    return buildMcpServers(
      this.deps.mcpManager.getStates(),
      this.deps.driverRegistry,
      this.deps.toolRegistry,
    );
  }

  private updateMcpPanel(): void {
    const servers = this.getMcpServers();
    if (!this.mcpPanelVisible) {
      this.mcpPanel.setText("");
      return;
    }
    if (servers.length === 0) {
      this.mcpPanel.setText(renderMcpServerList([], 0, 0));
      return;
    }

    if (this.mcpSelectedServerIndex == null) {
      this.mcpServerSelection = Math.max(0, Math.min(this.mcpServerSelection, servers.length - 1));
      const visibleRows = getMcpVisibleRows(servers.length);
      this.mcpServerWindowStart = Math.max(
        0,
        Math.min(this.mcpServerWindowStart, Math.max(servers.length - visibleRows, 0)),
      );
      this.mcpPanel.setText(renderMcpServerList(servers, this.mcpServerSelection, this.mcpServerWindowStart));
      return;
    }

    const serverIndex = Math.max(0, Math.min(this.mcpSelectedServerIndex, servers.length - 1));
    const server = servers[serverIndex];
    const maxToolIndex = Math.max(0, server.tools.length - 1);
    this.mcpToolSelection = Math.max(0, Math.min(this.mcpToolSelection, maxToolIndex));
    const visibleRows = getMcpVisibleRows(server.tools.length);
    this.mcpToolWindowStart = Math.max(
      0,
      Math.min(this.mcpToolWindowStart, Math.max(server.tools.length - visibleRows, 0)),
    );
    this.mcpPanel.setText(renderMcpToolList(server, this.mcpToolSelection, this.mcpToolWindowStart));
  }

  private handleMcpBrowserInput(data: string): boolean {
    const servers = this.getMcpServers();

    if (matchesKey(data, Key.escape)) {
      if (this.mcpSelectedServerIndex == null) {
        this.closeMcpBrowser();
      } else {
        this.mcpSelectedServerIndex = null;
        this.mcpToolSelection = 0;
        this.mcpToolWindowStart = 0;
        this.updateMcpPanel();
      }
      return true;
    }

    if (matchesKey(data, Key.up)) {
      if (!this.canNavigateMenu("up")) {
        return true;
      }
      if (this.mcpSelectedServerIndex == null) {
        const prev = this.mcpServerSelection;
        this.mcpServerSelection = Math.max(0, this.mcpServerSelection - 1);
        if (this.mcpServerSelection < prev) {
          this.mcpServerWindowStart = this.mcpServerSelection;
        }
      } else {
        const prev = this.mcpToolSelection;
        this.mcpToolSelection = Math.max(0, this.mcpToolSelection - 1);
        if (this.mcpToolSelection < prev) {
          this.mcpToolWindowStart = this.mcpToolSelection;
        }
      }
      this.updateMcpPanel();
      return true;
    }

    if (matchesKey(data, Key.down)) {
      if (!this.canNavigateMenu("down")) {
        return true;
      }
      if (this.mcpSelectedServerIndex == null) {
        const toolCount = servers.length;
        const visibleRows = getMcpVisibleRows(toolCount);
        const prev = this.mcpServerSelection;
        this.mcpServerSelection = Math.min(Math.max(toolCount - 1, 0), this.mcpServerSelection + 1);
        if (this.mcpServerSelection > prev && this.mcpServerSelection >= this.mcpServerWindowStart + visibleRows) {
          this.mcpServerWindowStart = this.mcpServerSelection - visibleRows + 1;
        }
      } else {
        const toolCount = servers[this.mcpSelectedServerIndex]?.tools.length ?? 0;
        const visibleRows = getMcpVisibleRows(toolCount);
        const prev = this.mcpToolSelection;
        this.mcpToolSelection = Math.min(Math.max(toolCount - 1, 0), this.mcpToolSelection + 1);
        if (this.mcpToolSelection > prev && this.mcpToolSelection >= this.mcpToolWindowStart + visibleRows) {
          this.mcpToolWindowStart = this.mcpToolSelection - visibleRows + 1;
        }
      }
      this.updateMcpPanel();
      return true;
    }

    if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
      if (this.mcpSelectedServerIndex == null) {
        if (servers.length === 0) {
          this.closeMcpBrowser();
        } else {
          this.mcpSelectedServerIndex = this.mcpServerSelection;
          this.mcpToolSelection = 0;
          this.mcpToolWindowStart = 0;
          this.updateMcpPanel();
        }
      }
      return true;
    }

    if (matchesKey(data, "ctrl+c") || data === "\x03") {
      this.closeMcpBrowser();
      return true;
    }

    return true;
  }

  /**
   * Handle pasted content that may contain images.
   *
   * Supports:
   * - Bracketed paste with image data (terminal wraps clipboard image in \x1b[200~...\x1b[201~)
   * - Kitty image protocol sequences (\x1b_G...\x1b\\) sent directly or within bracketed paste
   * - Mixed content: text accompanying images is extracted and passed through to the editor
   *
   * Returns an InputListenerResult:
   * - undefined: not a paste/kitty sequence, let other handlers process
   * - { consume: true }: pure image/kittty data, consume entirely
   * - { data: string }: mixed content, pass extracted text to editor while also loading image
   */
  private handlePasteImage(data: string): InputListenerResult {
    // ── Kitty image protocol (ESC _ G ... ESC \) ──
    // These APC sequences can arrive outside bracketed paste when the terminal
    // natively pastes images via Kitty protocol.
    if (this.handleKittyImageProtocol(data)) {
      return { consume: true };
    }

    // ── Bracketed paste ──
    const m = data.match(/^\x1b\[200~([\s\S]*?)\x1b\[201~$/);
    if (!m) return undefined;

    const pasteContent = m[1];

    // Check if paste is pure printable text (no image data)
    const hasControlChars = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(pasteContent);
    if (pasteContent.trim() !== "" && !hasControlChars) {
      // Pure text paste — let it through to the editor unchanged
      return undefined;
    }

    // ── Paste contains potential image data ──
    // Extract any printable text mixed with the image binary data
    const printableText = this.extractPrintableText(pasteContent);

    // Try to read the image from system clipboard (macOS only)
    if (this.imagePasteInFlight) {
      if (printableText.length > 0) {
        return { data: printableText };
      }
      return { consume: true };
    }
    this.imagePasteInFlight = true;
    readClipboardImageNonBlocking().then((img) => {
      this.imagePasteInFlight = false;
      if (img) {
        this.pendingImages.push(img);
        this.updateImageStatus();
        this.insertImagePlaceholder();
        this.conversation.addInlineImage(img.data, img.mimeType);
        this.conversation.addInfo(
          c.dim(`Image pasted from clipboard (${img.mimeType}, ${Math.round(img.data.length * 0.75 / 1024)} KB)`),
        );
        if (!this.deps.modelSupportsImages) {
          this.conversation.addInfo(
            c.yellow(`${this.deps.modelName} does not support image input.`),
          );
        }
      }
    });

    // If there's extractable printable text, pass it through to the editor
    // so text + image can coexist in the same message
    if (printableText.length > 0) {
      // Transform: strip the image data, keep the text for the editor
      return { data: printableText };
    }

    // Pure image paste — consume entirely (don't let binary data reach the editor)
    return { consume: true };
  }

  /**
   * Handle Kitty image protocol sequences.
   * Kitty uses APC sequences: ESC _ G <params> ; <base64> ESC \
   * These can arrive as direct input when pasting images in Kitty-native terminals.
   */
  private handleKittyImageProtocol(data: string): boolean {
    // Kitty image transmission always contains ESC _ G
    if (!data.includes("\x1b_G")) return false;

    // The data might be a Kitty image transmission.
    // We consume it and try to read the clipboard image instead,
    // since extracting base64 from Kitty protocol chunks is fragile.
    if (this.imagePasteInFlight) return true;
    this.imagePasteInFlight = true;
    readClipboardImageNonBlocking().then((img) => {
      this.imagePasteInFlight = false;
      if (img) {
        this.pendingImages.push(img);
        this.updateImageStatus();
        this.insertImagePlaceholder();
        this.conversation.addInlineImage(img.data, img.mimeType);
        this.conversation.addInfo(
          c.dim(`Image pasted from clipboard (${img.mimeType}, ${Math.round(img.data.length * 0.75 / 1024)} KB)`),
        );
        if (!this.deps.modelSupportsImages) {
          this.conversation.addInfo(
            c.yellow(`${this.deps.modelName} does not support image input.`),
          );
        }
      }
    });

    return true;
  }

  /**
   * Extract printable text characters from mixed binary/text content.
   * Filters out control characters while preserving spaces, newlines, tabs,
   * and all printable Unicode characters.
   */
  private extractPrintableText(content: string): string {
    return content
      .split("")
      .filter((char) => {
        const code = char.charCodeAt(0);
        // Keep: printable ASCII (>=32), newline, carriage return, tab
        // Also keep: all Unicode chars above ASCII range (code >= 128)
        return code >= 32 || char === "\n" || char === "\r" || char === "\t";
      })
      .join("")
      .trim();
  }

  private pasteClipboardImage(): void {
    if (this.imagePasteInFlight) return;
    this.imagePasteInFlight = true;
    readClipboardImageNonBlocking().then((img) => {
      this.imagePasteInFlight = false;
      if (img) {
        this.pendingImages.push(img);
        this.updateImageStatus();
        this.insertImagePlaceholder();
        this.conversation.addInlineImage(img.data, img.mimeType);
        this.conversation.addInfo(
          c.dim(`Image pasted from clipboard (${img.mimeType}, ${Math.round(img.data.length * 0.75 / 1024)} KB)`),
        );
        if (!this.deps.modelSupportsImages) {
          this.conversation.addInfo(
            c.yellow(`${this.deps.modelName} does not support image input.`),
          );
        }
      } else {
        this.conversation.addInfo(c.dim("No image found in clipboard (macOS only). Use /image <path> to attach an image file."));
      }
    });
  }

  private insertImagePlaceholder(): void {
    if (this.editor.insertTextAtCursor) {
      this.editor.insertTextAtCursor(TuiApp.IMAGE_PLACEHOLDER + " ");
    }
  }

  private handleCtrlC(): void {
    if (this.resolvePermission) {
      this.resolvePermissionChoice({ decision: "deny" });
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
  }

  addInfo(text: string): void {
    this.conversation.addInfo(text);
  }

  addAppNotification(app: AppInstance): void {
    const cyan = c.cyan ?? ((s: string) => s);
    const dim = c.dim ?? ((s: string) => s);
    const bold = c.bold ?? ((s: string) => s);
    const url = hyperlink(cyan.bold.underline(app.localUrl), app.localUrl);
    this.conversation.addNotice(
      bold(cyan("📱 MCP App ready")) + "\n" +
      url + "\n" +
      dim(`Open this link in your browser · ${app.serverName}:${app.toolName}`)
    );
  }

  addError(text: string): void {
    this.conversation.addError(text);
  }

  setProcessing(processing: boolean): void {
    this.processing = processing;
    this.editor.disableSubmit = processing && !this.permissionExplainMode;
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
    text = text.replace(/\[image\]\s*/g, "").trim();
    let images = this.pendingImages.length > 0 ? [...this.pendingImages] : undefined;
    const hasText = text.length > 0;
    const hasImages = Boolean(images?.length);
    if (!hasText && !hasImages) {
      if (this.imagePasteInFlight) return;
      this.imagePasteInFlight = true;
      readClipboardImageNonBlocking().then((img) => {
        this.imagePasteInFlight = false;
        if (img) {
          this.pendingImages.push(img);
          this.updateImageStatus();
            this.insertImagePlaceholder();
          this.conversation.addInlineImage(img.data, img.mimeType);
          this.conversation.addInfo(
            c.dim(`Image pasted from clipboard (${img.mimeType}, ${Math.round(img.data.length * 0.75 / 1024)} KB)`),
          );
          if (!this.deps.modelSupportsImages) {
            this.conversation.addInfo(
              c.yellow(`${this.deps.modelName} does not support image input.`),
            );
          }
        }
      });
      return;
    }

    this.editor.setText("");

    if (this.permissionExplainMode) {
      const state = this.pendingPermissionContext;
      this.resolvePermissionChoice({
        decision: "deny",
        denyReason: `User updated the request during permission review: ${text}`,
      });
      this.setProcessing(false);
      this.addUserMessage(text);
      this.setProcessing(true);
      this.deps.agent.prompt(text).then(
        () => {
          this.setProcessing(false);
        },
        (err) => {
          this.setProcessing(false);
          this.deps.sessionManager.trySaveSession(this.deps.agent);
          this.addError(err instanceof Error ? err.message : String(err));
        },
      );
      return;
    }

    if (this.processing) return;

    if (text.startsWith("/")) {
      executeSlashCommand(text, this.deps, this);
      return;
    }

    if (text === "exit" || text === "quit") {
      this.stop();
      return;
    }

    // Resolve @file references
    const resolved = resolveAtFileRefs(this.deps.projectPath, text, this.deps.config.atFile ?? {});
    if (resolved.warnings.length > 0) {
      for (const warn of resolved.warnings) {
        this.conversation.addInfo(c.yellow(`@${warn.path ?? ""}: ${warn.type}${warn.detail ? ` — ${warn.detail}` : ""}`));
      }
    }
    text = resolved.text;
    if (resolved.images.length > 0) {
      const atImages: ImageContent[] = resolved.images.map((img) => ({
        data: img.data,
        mimeType: img.mimeType,
      }) as ImageContent);
      images = [...(images ?? []), ...atImages];
    }
    if (this.pendingImages.length > 0 && !this.deps.modelSupportsImages) {
      this.conversation.addInfo(
        c.yellow(`${this.deps.modelName} does not support image input. Image will be omitted.`),
      );
    }

    const imageIndicator = images
      ? c.dim(`[${images.length} image(s) attached]`)
      : "";
    const userMessage = hasText
      ? imageIndicator ? `${text}\n${imageIndicator}` : text
      : imageIndicator;
    this.addUserMessage(userMessage);
    this.setProcessing(true);

    this.pendingImages = [];
    this.updateImageStatus();

    if (images && this.deps.modelNeedsOcr) {
      ocrImages(images).then(
        (result: OcrResult) => {
          let promptText: string;
          if (result.hasText) {
            promptText = hasText
              ? `${text}\n\n<image_text>\n${result.content}\n</image_text>`
              : `<image_text>\n${result.content}\n</image_text>`;
          } else {
            promptText = hasText
              ? `${text}\n\n(用户附带了一张图片，但图片中没有可识别的文字内容)`
              : "(用户附带了一张图片，但图片中没有可识别的文字内容)";
          }
          this.deps.agent.prompt(promptText).then(
            () => this.setProcessing(false),
            (err) => {
              this.setProcessing(false);
              this.deps.sessionManager.trySaveSession(this.deps.agent);
              this.addError(err instanceof Error ? err.message : String(err));
            },
          );
        },
        (err) => {
          this.deps.agent.prompt(text).then(
            () => this.setProcessing(false),
            (e) => {
              this.setProcessing(false);
              this.deps.sessionManager.trySaveSession(this.deps.agent);
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
          this.deps.sessionManager.trySaveSession(this.deps.agent);
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
    process.removeListener("SIGINT", this.sigintHandler);
    this.terminal.write("\n" + c.dim("Goodbye.\n"));
    this.tui.stop();
    this.exitResolve();
  }

  focusEditor(): void {
    this.tui.setFocus(this.editor);
  }

  clearConversationView(): void {
    this.conversation.clear();
    this.permissionExplainMode = false;
    this.pendingPermissionContext = null;
    this.lastMenuNavDirection = null;
    this.lastMenuNavAt = 0;
    this.pendingImages = [];
    if (this.mcpPanelVisible) {
      this.closeMcpBrowser();
    } else {
      this.updateImageStatus();
    }
    this.editor.setText("");
    this.editor.disableSubmit = this.processing && !this.permissionExplainMode;
    this.focusEditor();
    this.tui.requestRender(true);
  }


  replayMessages(messages: unknown[]): void {
    this.conversation.replayMessages(messages);
  }

  addPendingImage(image: ImageContent): void {
    this.pendingImages.push(image);
    this.updateImageStatus();
    this.insertImagePlaceholder();
  }

  private updateImageStatus(): void {
    if (this.pendingImages.length > 0) {
      const totalKB = Math.round(
        this.pendingImages.reduce((sum, img) => sum + img.data.length * 0.75, 0) / 1024,
      );
      this.imageStatus.setText(
        c.dim(` ${this.pendingImages.length} image(s) attached (${totalKB} KB) — type text and press Enter to send`),
      );
    } else {
      this.imageStatus.setText("");
    }
    this.tui.requestRender(true);
  }
}
