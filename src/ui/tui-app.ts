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
  type Component,
  matchesKey,
  isKeyRelease,
  Key,
  decodeKittyPrintable,
  hyperlink,
} from "@earendil-works/pi-tui";

import type { ImageContent } from "@earendil-works/pi-ai";
import type {
  PermissionPromptContext,
  PermissionPromptResult,
  PermissionRuleConfig,
} from "../permissions/types.js";
import type { HarnessAPI } from "../application/harness-api.js";
import type { AppInstance } from "../mcp/app/types.js";
import { c, editorTheme } from "./theme.js";
import { ConversationView, findPermOptionByKey } from "./conversation.js";
import { getSlashCommandAutocomplete, executeSlashCommand, resolveCustomCommand } from "./commands.js";
import { getMcpVisibleRows, reduceMcpBrowserState, renderMcpServerList, renderMcpToolList } from "./mcp-browser.js";
import type { McpBrowserState } from "./mcp-browser.js";
import { ImageManager } from "./image-manager.js";
import { ImagePasteHandler } from "./image-paste-handler.js";
import { FileTracker } from "./shared/file-tracker.js";
import { stageAttachedFiles } from "./shared/file-attachments.js";
import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { rebuildDisplayMessages } from "./shared/session-projector.js";
import { TuiActivityInspector } from "./tui-activity-inspector.js";
import { TuiPermissionInput } from "./tui-permission-input.js";
import type {
  ServerEvent,
  ToolResultRef,
} from "./shared/types.js";
import { findToolResultText } from "./shared/tool-result-projection.js";
// TuiDeps was replaced by the Application-owned HarnessAPI facade.

type InputListenerResult = { consume?: boolean; data?: string } | undefined;

export class TuiProcessingStatus implements Component {
  private visible = false;

  constructor(private readonly content: Component) {}

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  invalidate(): void {
    this.content.invalidate?.();
  }

  render(width: number): string[] {
    return this.visible ? this.content.render(width) : [];
  }
}

class HybridAutocompleteProvider implements AutocompleteProvider {
  private slashProvider: CombinedAutocompleteProvider;
  private readonly listFiles: HarnessAPI["project"]["listFiles"];

  constructor(
    slashCommands: { name: string; description?: string }[],
    projectPath: string,
    listFiles: HarnessAPI["project"]["listFiles"],
  ) {
    this.listFiles = listFiles;
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
      const items = this.listFiles(query, 20);
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
      const atIdx = prefix.indexOf("@");
      const newLine = `${beforePrefix}${prefix.slice(0, atIdx)}@${item.value}${suffix}${afterCursor}`;
      const newLines = [...lines];
      newLines[cursorLine] = newLine;
      const insertedLength = prefix.slice(0, atIdx).length + 1 + item.value.length + suffix.length;
      return { lines: newLines, cursorLine, cursorCol: beforePrefix.length + insertedLength };
    }
    return this.slashProvider.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
  }

  shouldTriggerFileCompletion(): boolean {
    return true;
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatContextPercent(estimated: number, contextWindow: number): string | null {
  if (contextWindow <= 0 || !isFinite(estimated) || Number.isNaN(estimated)) return null;
  const pct = Math.round((estimated / contextWindow) * 100);
  const text = `▓▓ ${pct}%`;
  if (pct > 95) return c.red(text);
  if (pct > 80) return c.yellow(text);
  return c.dim(text);
}

function formatCost(total: number): string {
  if (total >= 0.01) return `$${total.toFixed(4)}`;
  return `¢${(total * 100).toFixed(2)}`;

}
/**
 * Scan editor text for a [file:xxx] marker at the given cursor position.
 * Returns the display path inside the marker, or undefined if cursor is not on any marker.
 */
function findFileMarkerAt(text: string, cursorLine: number, cursorCol: number): string | undefined {
  const lines = text.split('\n');
  if (cursorLine < 0 || cursorLine >= lines.length) return undefined;
  const line = lines[cursorLine];
  const re = /\[file:([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (cursorCol >= m.index && cursorCol <= m.index + m[0].length) {
      return m[1];
    }
  }
  return undefined;
}

export class TuiApp {
  private deps: HarnessAPI;
  private terminal: ProcessTerminal;
  private tui: TUI;
  private conversation: ConversationView;
  private editor: Editor;
  private imageStatus: Text;
  private loader: CancellableLoader;
  private processingStatus: TuiProcessingStatus;
  private activityInspector: TuiActivityInspector | null = null;
  private activityInspectorOverlay: ReturnType<TUI["showOverlay"]> | null = null;
  private permissionInputOverlay: ReturnType<TUI["showOverlay"]> | null = null;
  private permissionPreviousFocus: "editor" | "inspector" | null = null;
  private persistedAgentResultMessages = new Map<string, readonly unknown[]>();
  private persistedAgentResultGeneration = 0;
  private mcpPanel = new Text("", 1, 0);
  private mcpPanelVisible = false;
  private mcpSelectedServerIndex: number | null = null;
  private mcpServerSelection = 0;
  private mcpServerWindowStart = 0;
  private mcpToolSelection = 0;
  private mcpToolWindowStart = 0;

  private get config() {
    return this.deps.settings.get();
  }
  private processing = false;
  private lastCtrlCPress = 0;
  private ctrlCDebounceUntil = 0;
  private lastMenuNavDirection: "up" | "down" | null = null;
  private lastMenuNavAt = 0;
  private resolvePermission: ((result: PermissionPromptResult) => void) | null = null;
  private handlingPermissionComponentInput = false;
  private pendingPermissionContext:
    | { toolName: string; preview: string; args: unknown }
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
  // ── Image lifecycle (delegated to ImagePasteHandler) ──
  private imagePasteHandler: ImagePasteHandler;
  // ── File tracker for drag-and-drop ──
  private fileTracker: FileTracker;
  // ── Attachment bar scroll offset ──
  private attachmentScrollOffset: number = 0;
  // Pre-drained images: captured in input listener before Editor's onChange("") clears them
  private drainedSubmitImages: ImageContent[] | null = null;
  // Pre-drained files: captured in input listener before Editor's onChange("") clears them
  private drainedSubmitFiles: string[] | null = null;
  // Absolute path shown when cursor is on a [file:xxx] placeholder
  private hoveredFilePath: string | null = null;
  private lastPasteTime = 0;
  private pendingImageLoads = 0;
  // ── Kitty protocol multi-chunk buffer ──
  // Kitty transmits large images in chunks. Accumulate base64 payloads here
  // keyed by a synthetic ID until the final chunk (v=8) arrives.
  private kittyChunkBuffer: { base64: string; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor(deps: HarnessAPI) {
    this.deps = deps;
    this.terminal = new ProcessTerminal();
    this.tui = new TUI(this.terminal, true);
    this.conversation = new ConversationView(this.tui);
    this.imageStatus = new Text("");

    this.loader = new CancellableLoader(this.tui, c.cyan, c.dim, "Waiting...");
    this.loader.stop();
    this.processingStatus = new TuiProcessingStatus(this.loader);

    const autocomplete = new HybridAutocompleteProvider(
      getSlashCommandAutocomplete(deps.commands.list()),
      deps.settings.get().projectPath,
      deps.project.listFiles,
    );
    this.editor = new Editor(this.tui, editorTheme, { paddingX: 1 });
    this.imagePasteHandler = new ImagePasteHandler(
      new ImageManager(),
      this.editor,
      this.conversation,
      this.imageStatus,
      this.tui,
    );
    this.fileTracker = new FileTracker();
    this.editor.setAutocompleteProvider(autocomplete);
    this.editor.onSubmit = (text) => this.handleSubmit(text.trim());
    this.editor.onChange = (text) => {
      // ── Sync [image:<id>] placeholders with image manager via ID-set diff. ──
      // Strip [file:xxx] markers first to avoid conflict with [image:N] detection.
      const textForImages = text.replace(/\[file:[^\]]+\]/g, "");
      const RE = /\[image:(\d+)\]/g;
      const presentIds = new Set<number>();
      for (const m of textForImages.matchAll(RE)) {
        presentIds.add(Number(m[1]));
      }
      // Guard: if images were pre-drained by input listener (Enter key),
      // don't remove — handleSubmit will use drainedSubmitImages.
      if (!this.drainedSubmitImages) {
        const removedIds = this.imagePasteHandler.getAllIds().filter((id) => !presentIds.has(id));
        for (const id of removedIds) {
          this.imagePasteHandler.removeImageById(id);
        }
      }

      // ── Sync [file:xxx] markers with FileTracker (bidirectional) ──
      const fileMarkerRe = /\[file:([^\]]+)\]/g;
      const presentDisplayPaths = new Set<string>();
      for (const m of text.matchAll(fileMarkerRe)) {
        presentDisplayPaths.add(m[1]);
      }

      const currentDisplayPaths = this.fileTracker.getDisplayPaths();
      const currentAbsPaths = this.fileTracker.getAll();
      const displayToAbs = new Map<string, string>();
      for (let j = 0; j < currentDisplayPaths.length; j++) {
        displayToAbs.set(currentDisplayPaths[j], currentAbsPaths[j]);
      }

      // Added: present in text but not in tracker
      for (const dp of presentDisplayPaths) {
        if (!displayToAbs.has(dp)) {
          const absPath = resolvePath(this.config.projectPath, dp);
          if (existsSync(absPath)) {
            this.fileTracker.add(absPath, this.config.projectPath);
          }
        }
      }

      // Removed: in tracker but not in text
      for (const dp of currentDisplayPaths) {
        if (!presentDisplayPaths.has(dp)) {
          const absPath = displayToAbs.get(dp);
          if (absPath) {
            this.fileTracker.remove(absPath);
          }
        }
      }


      // ── Cursor-position-based absolute path reveal for [file:xxx] placeholders ──
      const cursor = this.editor.getCursor();
      const editorText = this.editor.getText();
      const hoveredDisplayPath = findFileMarkerAt(editorText, cursor.line, cursor.col);
      if (hoveredDisplayPath) {
        this.hoveredFilePath = this.fileTracker.getAbsPath(hoveredDisplayPath) ?? null;
      } else {
        this.hoveredFilePath = null;
      }
      this.updateAttachmentBar();
    };

    this.tui.addInputListener((data) => {
      const pasteResult = this.handlePasteImage(data);
      if (pasteResult) {
        return pasteResult;
      }
      // Pre-submit drain: if Enter/Return is pressed with pending images or files,
      // drain them NOW before the Editor fires onChange("") which would
      // otherwise trigger removeImageById / fileTracker.remove.
      if (
        (matchesKey(data, Key.enter) || matchesKey(data, Key.return) || data === "\r" || data === "\n")
        && !this.processing
        && !this.activityInspectorOverlay
        && !this.resolvePermission
      ) {
        if (this.imagePasteHandler.imageCount > 0) {
          this.drainedSubmitImages = this.imagePasteHandler.drainImages();
        }
        if (this.fileTracker.count > 0) {
          this.drainedSubmitFiles = this.fileTracker.drain();
        }
      }
      const handled = this.handleInput(data);
      if (handled) {
        return { consume: true };
      }
      return undefined;
    });

    this.loader.onAbort = () => {
      deps.conversation.abort();
    };

    this.buildLayout();
  }

  private buildLayout(): void {
    const root = new Box(1);
    root.addChild(new TruncatedText(c.bold("DSCode ") + c.dim(`· ${this.deps.settings.modelInfo().name}`), 1));
    root.addChild(this.conversation.component);
    this.tui.addChild(root);
    this.tui.addChild(this.processingStatus);
    this.tui.addChild(this.imageStatus);
    this.tui.addChild(this.editor);
    this.tui.addChild(this.mcpPanel);
  }
  getPromptPermission(): (toolName: string,
    preview: string,
    args: unknown,
    context?: PermissionPromptContext,
  ) => Promise<PermissionPromptResult> {
    return (toolName, preview, args, context) =>
      this.showPermissionPrompt(toolName, preview, args, context);
  }

  private async showPermissionPrompt(
    toolName: string,
    preview: string,
    args: unknown,
    context?: PermissionPromptContext,
  ): Promise<PermissionPromptResult> {
    this.pendingPermissionContext = { toolName, preview, args };
    this.permissionExplainMode = false;
    this.permissionPreviousFocus = this.activityInspectorOverlay?.isFocused()
      ? "inspector"
      : "editor";
    const fuzzyInfo = this.deps.permissions.fuzzy(toolName, args);
    const fuzzy = fuzzyInfo.toolPattern;
    const fuzzyArgDesc = fuzzyInfo.argDescription;
    const llmSuggestions = this.deps.permissions.suggestions(toolName, args);
    this.conversation.showPermissionPrompt(
      toolName,
      preview,
      fuzzy,
      fuzzyArgDesc,
      context,
    );
    if (llmSuggestions.length > 0) {
      const ap = this.conversation.activePermission;
      if (ap) ap.llmSuggestions = [...llmSuggestions];
    }
    const permissionInput = new TuiPermissionInput((data) => {
      this.handlePermissionInput(data);
    });
    this.permissionInputOverlay?.hide();
    this.permissionInputOverlay = this.tui.showOverlay(permissionInput, {
      width: 1,
      maxHeight: 1,
      anchor: "bottom-right",
    });
    // Prefetch for next time (fire-and-forget)
    this.deps.permissions.prefetchSuggestions(toolName, args, preview);
    return new Promise((resolve) => {
      this.resolvePermission = resolve;
    });
  }

  takePendingPermission() {
    const context = this.pendingPermissionContext;
    if (!context || !this.resolvePermission) return undefined;
    const pending = {
      toolName: context.toolName,
      preview: context.preview,
      fuzzyPattern: this.deps.permissions.fuzzy(context.toolName).toolPattern,
      permissionArgs: context.args,
    };
    this.resolvePermissionChoice({ decision: "deny" });
    return pending;
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
    this.permissionInputOverlay?.hide();
    this.permissionInputOverlay = null;
    if (this.permissionPreviousFocus === "inspector" && this.activityInspectorOverlay) {
      this.activityInspectorOverlay.focus();
    } else {
      this.focusEditor();
    }
    this.permissionPreviousFocus = null;
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

  private applyPermissionOption(option: "allow" | "always_allow" | "always_allow_save" | "explain" | "deny"): void {
    if (option === "deny") {
      this.resolvePermissionChoice({ decision: "deny" });
      return;
    }
    if (option === "always_allow") {
      const fuzzy = this.deps.permissions.fuzzy(
        this.pendingPermissionContext?.toolName ?? "",
      ).toolPattern;
      if (fuzzy && fuzzy !== this.pendingPermissionContext?.toolName) {
        this.conversation.enterSubMode("session", fuzzy);
      } else {
        this.resolvePermissionChoice({ decision: "allow", rememberForSession: true });
      }
      return;
    }
    if (option === "always_allow_save") {
      const fuzzy = this.deps.permissions.fuzzy(
        this.pendingPermissionContext?.toolName ?? "",
      ).toolPattern;
      if (fuzzy) {
        this.conversation.enterSubMode("save", fuzzy);
      } else {
        this.saveExactRule();
      }
      return;
    }
    if (option === "explain") {
      this.permissionExplainMode = true;
      this.editor.disableSubmit = false;
      this.conversation.clearPermissionPrompt();
      this.permissionInputOverlay?.setHidden(true);
      this.tui.setFocus(this.editor);
      this.tui.requestRender(true);
      return;
    }
    this.resolvePermissionChoice({ decision: "allow" });
  }

  private saveExactRule(): void {
    const ctx = this.pendingPermissionContext;
    const persistRule = ctx
      ? this.buildPersistedRule(ctx.toolName, ctx.args, "saved from permission prompt")
      : undefined;
    this.resolvePermissionChoice({ decision: "allow", rememberForSession: true, persistRule });
  }

  private applyFuzzySaveOption(subIdx: number): void {
    const ctx = this.pendingPermissionContext;
    if (!ctx) { this.resolvePermissionChoice({ decision: "deny" }); return; }
    if (subIdx === 0) { this.saveExactRule(); }
    else if (subIdx === 1) {
      const fuzzy = this.deps.permissions.fuzzy(ctx.toolName).toolPattern;
      this.resolvePermissionChoice({ decision: "allow", rememberForSession: true, persistRule: fuzzy ? { tool: fuzzy, decision: "allow" as const } : undefined });
    } else if (subIdx === 2 && this.conversation.activePermission?.fuzzyArgDesc) {
      const fuzzyArg = this.deps.permissions.fuzzy(
        ctx.toolName,
        ctx.args,
      ).argPattern;
      this.resolvePermissionChoice({ decision: "allow", rememberForSession: true, persistRule: fuzzyArg ? { tool: ctx.toolName, argPattern: fuzzyArg, decision: "allow" as const } : undefined });
    } else {
      const llm = this.conversation.activePermission?.llmSuggestions;
      const suggestionOffset = this.conversation.activePermission?.fuzzyArgDesc
        ? 3
        : 2;
      const s = llm ? llm[subIdx - suggestionOffset] : null;
      if (s) {
        this.resolvePermissionChoice({
          decision: "allow",
          rememberForSession: true,
          persistRule: {
            tool: s.toolPattern ?? ctx.toolName,
            argPattern: s.argPattern ?? undefined,
            decision: "allow" as const,
          },
        });
      } else {
        this.saveExactRule();
      }
    }
  }

  private applySessionGrantOption(subIdx: number): void {
    if (subIdx === 0) {
      this.resolvePermissionChoice({ decision: "allow", rememberForSession: true });
    } else {
      const fuzzy = this.deps.permissions.fuzzy(
        this.pendingPermissionContext?.toolName ?? "",
      ).toolPattern;
      this.resolvePermissionChoice({ decision: "allow", rememberForSession: true, sessionGrantPattern: fuzzy ?? undefined });
    }
  }

  private applyAllowOption(subIdx: number): void {
    if (subIdx === 0) {
      this.resolvePermissionChoice({ decision: "allow" });
    } else {
      const fuzzy = this.deps.permissions.fuzzy(
        this.pendingPermissionContext?.toolName ?? "",
      ).toolPattern;
      this.resolvePermissionChoice({ decision: "allow", rememberForSession: true, sessionGrantPattern: fuzzy ?? undefined });
    }
  }

  private handlePermissionInput(data: string): void {
    this.handlingPermissionComponentInput = true;
    try {
      this.handleInput(data);
    } finally {
      this.handlingPermissionComponentInput = false;
    }
  }

  private handleInput(data: string): boolean {
    if (isKeyRelease(data)) return true;
    const printable = decodeKittyPrintable(data) ?? data;
    if (this.permissionExplainMode) {
      if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c") || data === "\x03") {
        this.resolvePermissionChoice({ decision: "deny" });
        return true;
      }
      return false;
    }

    if (this.resolvePermission && !this.handlingPermissionComponentInput) {
      return false;
    }

    if (this.resolvePermission) {
      // Sub-mode takes priority
      if (this.conversation.isInSubMode()) {
        if (matchesKey(data, Key.up)) { this.conversation.permSubNavigate(-1); return true; }
        if (matchesKey(data, Key.down)) { this.conversation.permSubNavigate(1); return true; }
        if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
          const idx = this.conversation.permSubSelect();
          const t = this.conversation.permSubModeType;
          if (t === "session") this.applySessionGrantOption(idx);
          else if (t === "allow") this.applyAllowOption(idx);
          else this.applyFuzzySaveOption(idx);
          return true;
        }
        if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c") || data === "\x03") {
          this.conversation.cancelSubMode(); return true;
        }
        const numericChoice = /^[1-9]$/.test(printable) ? Number(printable) - 1 : -1;
        if (
          numericChoice >= 0
          && numericChoice < this.conversation.getPermSubOptionCount()
        ) {
          const t = this.conversation.permSubModeType;
          if (t === "session") this.applySessionGrantOption(numericChoice);
          else if (t === "allow") this.applyAllowOption(numericChoice);
          else this.applyFuzzySaveOption(numericChoice);
          return true;
        }
        return true;
      }

      if (matchesKey(data, Key.up)) {
        if (this.canNavigateMenu("up")) { this.conversation.permNavigate(-1); }
        return true;
      }
      if (matchesKey(data, Key.down)) {
        if (this.canNavigateMenu("down")) { this.conversation.permNavigate(1); }
        return true;
      }
      if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
        const sel = this.conversation.permSelect();
        if (sel) { this.applyPermissionOption(sel.value); }
        return true;
      }
      if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c") || data === "\x03") {
        if (this.conversation.isInSubMode()) {
          this.conversation.cancelSubMode();
        } else if (!this.conversation.justCancelledSubMode) {
          this.resolvePermissionChoice({ decision: "deny" });
        }
        return true;
      }
      const shortcut = findPermOptionByKey(printable);
      if (shortcut) { this.applyPermissionOption(shortcut.value); return true; }
      return true;
    }

    if (this.mcpPanelVisible) {
      return this.handleMcpBrowserInput(data);
    }

    if (matchesKey(data, Key.ctrl("e"))) {
      if (this.activityInspectorOverlay) this.closeActivityInspector();
      else this.openActivityInspector();
      return true;
    }
    if (this.activityInspectorOverlay) {
      return false;
    }

    if (this.processing) {
      if (matchesKey(data, Key.escape) || matchesKey(data, Key.tab)) {
        this.deps.conversation.abort();
        this.conversation.addInfo("(aborted)");
        return true;
      }
      if (matchesKey(data, "ctrl+c") || data === "\x03") {
        this.handleCtrlC();
        return true;
      }
      return true;
    } else {
      if (matchesKey(data, "ctrl+c") || data === "\x03") {
        this.handleCtrlC();
        return true;
      }
      if ((matchesKey(data, Key.super("v")) || matchesKey(data, Key.ctrl("v")) || data === "\x16") && !data.includes(":3u")) {
        this.pasteClipboardImage();
        return true;
      }

      // ── Attachment bar: display-only, scroll via arrows ──
      const fileCount = this.fileTracker.count;
      const imageCount = this.imagePasteHandler.imageCount;
      if (fileCount > 0 || imageCount > 0 || this.pendingImageLoads > 0) {
        if (matchesKey(data, Key.escape)) {
          this.fileTracker.clear();
          this.imagePasteHandler.clear();
          this.flushKittyBuffer();
          this.attachmentScrollOffset = 0;
          // Strip [file:xxx] markers from editor text
          const currentText = this.editor.getText();
          const cleaned = currentText.replace(/\[file:[^\]]+\]\s*/g, "");
          if (cleaned !== currentText) {
            this.editor.setText(cleaned);
          }
          this.updateAttachmentBar();
          return true;
        }
        if (matchesKey(data, Key.ctrlShift("left"))) {
          this.attachmentScrollOffset = Math.max(0, this.attachmentScrollOffset - 1);
          this.updateAttachmentBar();
          return true;
        }
        if (matchesKey(data, Key.ctrlShift("right"))) {
          this.attachmentScrollOffset += 1;
          this.updateAttachmentBar();
          return true;
        }
      }
    }

    return false;
  }


  private updateAttachmentBar(): void {
    const imageCount = this.imagePasteHandler.imageCount;
    const filePaths = this.fileTracker.getDisplayPaths();
    const fileAbsPaths = this.fileTracker.getAll();

    if (imageCount === 0 && filePaths.length === 0 && this.pendingImageLoads === 0) {
      this.imageStatus.setText("");
      this.tui.requestRender(true);
      return;
    }

    // Clamp scroll offset
    const maxScroll = Math.max(0, filePaths.length - 1);
    this.attachmentScrollOffset = Math.min(this.attachmentScrollOffset, maxScroll);

    const parts: string[] = [];

    if (imageCount > 0) {
      const label = ` \u{1F5BC} ${imageCount} image${imageCount > 1 ? "s" : ""} `;
      parts.push(c.bgBlue(label));
    }

    if (this.pendingImageLoads > 0) {
      const label = this.pendingImageLoads === 1
        ? " Preparing image... "
        : ` Preparing ${this.pendingImageLoads} images... `;
      parts.push(c.bgBlue(label));
    }

    if (filePaths.length > 0) {
      parts.push("\u{1F4CE}");
    }

    for (let i = this.attachmentScrollOffset; i < filePaths.length; i++) {
      const label = ` ${filePaths[i]} `;
      parts.push(hyperlink(c.bgBlue(label), `file://${fileAbsPaths[i]}`));
    }

    const chipsLine = parts.join(" ");
    const scrollHint = this.attachmentScrollOffset > 0
      ? ` +${this.attachmentScrollOffset} more`
      : "";
    const hintLine = c.dim(`Ctrl+Shift+\u2190 \u2192 scroll${scrollHint} \u00b7 Esc clear all`);
    const hoverLine = this.hoveredFilePath
      ? c.dim(`\nPath: ${this.hoveredFilePath}`)
      : "";
    this.imageStatus.setText(`${chipsLine}${hoverLine}\n${hintLine}`);
    this.tui.requestRender(true);
  }

  private beginPendingImageLoad(): void {
    this.pendingImageLoads += 1;
    this.updateAttachmentBar();
  }

  private endPendingImageLoad(): void {
    this.pendingImageLoads = Math.max(0, this.pendingImageLoads - 1);
    this.updateAttachmentBar();
  }
  openMcpBrowser(): void {
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
    return this.deps.mcp.list().map((server) => ({
      ...server,
      tools: [...server.tools],
    }));
  }

  private updateMcpPanel(): void {
    const servers = this.getMcpServers();
    if (!this.mcpPanelVisible) {
      this.mcpPanel.setText("");
      return;
    }
    if (servers.length === 0) {
      this.mcpPanel.setText(renderMcpServerList([], 0, 0));
      this.tui.requestRender(true);
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
      this.tui.requestRender(true);
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
    this.tui.requestRender(true);
  }

  private handleMcpBrowserInput(data: string): boolean {
    const servers = this.getMcpServers();

    if (matchesKey(data, Key.escape)) {
      return this.applyMcpBrowserResult(
        reduceMcpBrowserState(this.getMcpBrowserState(), { type: "escape" }, servers.length, this.getMcpToolCount(servers)),
      );
    }

    if (matchesKey(data, Key.up)) {
      if (!this.canNavigateMenu("up")) return true;
      return this.applyMcpBrowserResult(
        reduceMcpBrowserState(this.getMcpBrowserState(), { type: "up" }, servers.length, this.getMcpToolCount(servers)),
      );
    }

    if (matchesKey(data, Key.down)) {
      if (!this.canNavigateMenu("down")) return true;
      return this.applyMcpBrowserResult(
        reduceMcpBrowserState(this.getMcpBrowserState(), { type: "down" }, servers.length, this.getMcpToolCount(servers)),
      );
    }

    if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
      return this.applyMcpBrowserResult(
        reduceMcpBrowserState(this.getMcpBrowserState(), { type: "enter" }, servers.length, this.getMcpToolCount(servers)),
      );
    }

    if (matchesKey(data, "ctrl+c") || data === "\x03") {
      this.closeMcpBrowser();
      return true;
    }

    return true;
  }

  private applyMcpBrowserResult(result: { state: McpBrowserState; shouldClose: boolean }): boolean {
    if (result.shouldClose) {
      this.closeMcpBrowser();
      return true;
    }
    this.mcpSelectedServerIndex = result.state.selectedServerIndex;
    this.mcpServerSelection = result.state.serverSelection;
    this.mcpServerWindowStart = result.state.serverWindowStart;
    this.mcpToolSelection = result.state.toolSelection;
    this.mcpToolWindowStart = result.state.toolWindowStart;
    this.updateMcpPanel();
    return true;
  }

  private getMcpBrowserState(): McpBrowserState {
    return {
      selectedServerIndex: this.mcpSelectedServerIndex,
      serverSelection: this.mcpServerSelection,
      serverWindowStart: this.mcpServerWindowStart,
      toolSelection: this.mcpToolSelection,
      toolWindowStart: this.mcpToolWindowStart,
    };
  }

  private getMcpToolCount(servers: ReturnType<typeof this.getMcpServers>): number {
    return servers[this.mcpSelectedServerIndex ?? -1]?.tools.length ?? 0;
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
    const kittyResult = this.handleKittyProtocol(data);
    if (kittyResult) {
      return kittyResult;
    }

    // ── Bracketed paste ──
    const m = data.match(/^\x1b\[200~([\s\S]*?)\x1b\[201~$/);
    if (!m) return undefined;

    const pasteContent = m[1];

    // Check if paste is pure printable text (no image data)
    const hasControlChars = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(pasteContent);
    if (pasteContent.trim() !== "" && !hasControlChars) {
      // Pure text paste — let it through to the editor unchanged
      const lines = pasteContent.split("\n");
      const totalChars = pasteContent.length;
      if (lines.length > 10 || totalChars > 1000) {
        const desc = lines.length > 10
          ? `[paste # +${lines.length} lines]`
          : `[paste # ${totalChars} chars]`;
        this.conversation.addInfo(c.dim(`Large paste accepted — ${desc}. Press Enter to submit full content.`));
      }
      // Check for file drop: single absolute path to an existing file
      const trimmed = pasteContent.trim();
      if (trimmed && (trimmed.startsWith("/") || /^[A-Za-z]:[/\\]/.test(trimmed))) {
        // Unescape shell-style escapes (Ghostty escapes spaces in drag-drop paths)
        const unescaped = trimmed.replace(/\\(.)/g, "$1");
        if (existsSync(unescaped)) {
          const displayPath = this.fileTracker.add(unescaped, this.config.projectPath);
          this.editor.insertTextAtCursor("[file:" + displayPath + "] ");
          this.updateAttachmentBar();
          return { consume: true };
        }
      }
      
      return undefined;
    }

    // ── Paste contains potential image data ──
    // Extract any printable text mixed with the image binary data
    const printableText = this.extractPrintableText(pasteContent);

    // Try to read the image from system clipboard (macOS only).
    // Debounce: same paste event often triggers both Kitty and Bracketed
    // handlers within ~50ms. Skip if we just processed one.
    const now = Date.now();
    if (now - this.lastPasteTime < 100) {
      return { consume: true };
    }
    this.lastPasteTime = now;
    this.beginPendingImageLoad();
    this.deps.images.readClipboardNonBlocking().then((img) => {
      if (img) {
        this.imagePasteHandler.addImage(img);
      }
    }).finally(() => {
      this.endPendingImageLoad();
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
   * Format: f=<format> (24=PNG), s=<chunk_size>, v=<version> (8=final, 16=chunk)
   * These can arrive as direct input when pasting images in Kitty-native terminals
   * (Ghostty, Kitty, WezTerm with Kitty protocol enabled).
   *
   * Returns an InputListenerResult:
   * - null: not a Kitty image sequence, let caller handle it
   * - { consume: true }: pure image data, consumed entirely
   * - { data: string }: text mixed with kitty data, pass text to editor
   */
  private handleKittyProtocol(data: string): InputListenerResult {
    if (!data.includes("\x1b_G")) return undefined;

    // Parse Kitty APC sequence: ESC _ G <params> ; <base64> ESC \\
    // Extract all APC sequences from the data
    const apcRegex = /\x1b_G([^;]*);([^\x1b]*)\x1b\\/g;
    const apcMatches: { params: string; b64: string }[] = [];
    let apcMatch: RegExpExecArray | null;
    while ((apcMatch = apcRegex.exec(data)) !== null) {
      apcMatches.push({ params: apcMatch[1], b64: apcMatch[2] });
    }

    if (apcMatches.length === 0) return undefined;

    // Check if any of the APC sequences are image transmissions (f=24 = PNG)
    const hasImage = apcMatches.some(m => /(?:^|,)f=24(?:,|$)/.test(m.params));
    if (!hasImage) return undefined; // Non-image Kitty sequence (cursor, etc.)

    // Extract printable text surrounding the APC sequences
    const cleanText = data.replace(/\x1b_G[^;]*;([^\x1b]*)\x1b\\/g, "").trim();
    const printableText = this.extractPrintableText(cleanText);

    // Determine if any chunk is final (v=8) or intermediate (v=16)
    const isFinal = apcMatches.some(m => /(?:^|,)v=8(?:,|$)/.test(m.params));

    // Accumulate base64 payload
    const chunkB64 = apcMatches.map(m => m.b64).join("");

    if (isFinal) {
      // Final chunk — flush accumulated + this chunk
      const prevB64 = this.kittyChunkBuffer?.base64 ?? "";
      const fullB64 = prevB64 + chunkB64;
      this.flushKittyBuffer();

      try {
        // Decode base64 to binary, build ImageContent
        const binary = Buffer.from(fullB64, "base64");
        const img: ImageContent = {
          type: "image" as const,
          data: binary.toString("base64"),
          mimeType: "image/png",
        };
        // Defer addImage to avoid requestRender(true) during pi-tui input processing
        queueMicrotask(() => { this.imagePasteHandler.addImage(img); setTimeout(() => this.tui.requestRender(true), 0); });
      } catch {
        // Malformed base64 — consume silently
      }

      if (printableText.length > 0) {
        return { data: printableText };
      }
      return { consume: true };
    }

    // Intermediate chunk — buffer it
    if (this.kittyChunkBuffer) {
      clearTimeout(this.kittyChunkBuffer.timer);
    }
    const prevB64 = this.kittyChunkBuffer?.base64 ?? "";
    if (!this.kittyChunkBuffer) {
      this.beginPendingImageLoad();
    }
    this.kittyChunkBuffer = {
      base64: prevB64 + chunkB64,
      timer: setTimeout(() => {
        this.flushKittyBuffer();
      }, 200),
    };

    if (printableText.length > 0) {
      return { data: printableText };
    }
    return { consume: true };
  }

  private flushKittyBuffer(): void {
    if (this.kittyChunkBuffer) {
      clearTimeout(this.kittyChunkBuffer.timer);
      this.kittyChunkBuffer = null;
      this.endPendingImageLoad();
    }
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
    const now = Date.now();
    if (now - this.lastPasteTime < 100) return;
    this.lastPasteTime = now;
    this.beginPendingImageLoad();
    const tryRead = (attempt: number) => {
      this.deps.images.readClipboardNonBlocking().then(
        (img) => {
          if (img) {
            this.imagePasteHandler.addImage(img);
            this.endPendingImageLoad();
            setTimeout(() => this.tui.requestRender(true), 0);
          } else if (attempt < 1) {
            setTimeout(() => tryRead(attempt + 1), 1500);
          } else {
            this.endPendingImageLoad();
            this.conversation.addInfo(c.dim("No image found in clipboard. Use /image <path> to attach an image file."));
          }
        },
        () => {
          if (attempt < 1) {
            setTimeout(() => tryRead(attempt + 1), 1500);
          } else {
            this.endPendingImageLoad();
            this.conversation.addInfo(c.dim("Could not read the clipboard image."));
          }
        },
      );
    };
    tryRead(0);
  }
  private handleCtrlC(): void {
    if (this.resolvePermission) {
      this.resolvePermissionChoice({ decision: "deny" });
      return;
    }

    if (this.processing) {
      this.deps.conversation.abort();
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

  private openActivityInspector(): void {
    if (this.activityInspectorOverlay) return;
    this.activityInspector = new TuiActivityInspector(
      () => this.conversation.getMessages(),
      (ref) => this.resolveToolResultRef(ref),
      () => this.closeActivityInspector(),
      () => this.tui.requestRender(false),
    );
    this.activityInspectorOverlay = this.tui.showOverlay(
      this.activityInspector,
      {
        width: "92%",
        maxHeight: "88%",
        anchor: "center",
        margin: 1,
      },
    );
    this.tui.requestRender(true);
  }

  private closeActivityInspector(): void {
    this.activityInspectorOverlay?.hide();
    this.activityInspectorOverlay = null;
    this.activityInspector = null;
    this.focusEditor();
    this.tui.requestRender(true);
  }

  private resolveToolResultRef(ref: ToolResultRef): string | undefined {
    const live = this.deps.conversation.toolResult(
      ref.owner === "session" ? "session" : "agent",
      ref.owner === "agent-process" ? ref.ownerId : undefined,
      ref.toolCallId,
    );
    if (live) return live;
    const messages = ref.owner === "agent-process"
      ? this.persistedAgentResultMessages.get(ref.ownerId)
      : undefined;
    return messages
      ? findToolResultText(messages, ref.toolCallId)
      : undefined;
  }

  applyConversationEvent(event: ServerEvent): void {
    if (
      event.type === "thinking_delta"
      || event.type === "text_delta"
      || event.type === "tool_start"
      || event.type === "tool_end"
    ) {
      this.markActivity();
    }
    this.conversation.applyConversationEvent(event);
    this.activityInspector?.refresh();
    this.tui.requestRender(false);
  }

  addUserMessage(text: string): void {
    this.conversation.addUserMessage(text);
  }

  startAssistantMessage(): void {
    this.conversation.startAssistantMessage();
  }

  thinkingDelta(delta: string): void {
    this.markActivity();
    this.conversation.thinkingDelta(delta);
  }

  textDelta(delta: string): void {
    this.markActivity();
    this.conversation.textDelta(delta);
  }

  toolStart(name: string, args: unknown, toolCallId?: string): void {
    this.markActivity();
    this.conversation.toolStart(name, args, toolCallId);
  }

  toolEnd(name: string, result: unknown, isError: boolean, toolCallId?: string): void {
    this.markActivity();
    this.conversation.toolEnd(name, result, isError, toolCallId);
  }

  finishAssistantMessage(usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: { total: number } }): void {
    this.conversation.finishAssistantMessage();
    this.finishAssistantTurnMetadata(usage);
  }

  finishAssistantTurnMetadata(usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: { total: number } }): void {
    this.finalizeIdleSegment();
    const parts: string[] = [];
    if (this.totalWaitMs >= 1000) {
      parts.push(`⏱ ${this.formatElapsed(this.totalWaitMs)}`);
    }
    if (usage && usage.input > 0 && usage.output > 0) {
      parts.push(`📊 ${formatTokens(usage.input)}↓ ${formatTokens(usage.output)}↑`);
    }
    {
      const usage = this.deps.conversation.contextUsage();
      const ctxStr = formatContextPercent(usage.used, usage.total);
      if (ctxStr) parts.push(ctxStr);
    }
    if (usage && usage.cost.total > 0) {
      parts.push(`💰 ${formatCost(usage.cost.total)}`);
    }
    if (parts.length > 0) {
      this.conversation.addInfo(c.dim(parts.join(" · ")));
    }
  }

  addInfo(text: string, _display?: "toast" | "panel"): void {
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

  addWarning(text: string): void {
    this.conversation.addWarning(text);
  }

  addRetry(info: { attempt: number; maxRetries: number; delayMs: number; error: string; level: "stream" | "turn" }): void {
    this.conversation.addRetry(info);
  }

  setProcessing(processing: boolean): void {
    if (this.processing === processing) {
      this.editor.disableSubmit = processing && !this.permissionExplainMode;
      return;
    }
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
        const activeExecution = this.conversation.getActiveExecutionStatus();
        this.tipDuration += 500;
        if (this.tipDuration >= 4000) {
          this.showTip = !this.showTip;
          this.tipDuration = 0;
        }
        if (activeExecution) {
          this.loader.setMessage(
            `${activeExecution}  ${c.dim(`(${this.formatElapsed(elapsed)})`)}`,
          );
        } else if (this.showTip) {
          const tips = [
            "Ctrl+E to inspect activity",
            "Esc or Tab to abort",
            "Ctrl+C to abort",
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
      this.processingStatus.setVisible(true);
      this.loader.start();
    } else {
      if (this.idleTimer) {
        clearInterval(this.idleTimer);
        this.idleTimer = undefined;
      }
      this.finalizeIdleSegment();
      this.loader.stop();
      this.processingStatus.setVisible(false);
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

  private async handleSubmit(text: string, echoText?: string): Promise<void> {
    const displayText = echoText ?? text;
    text = text.replace(/\[image:\d+\]\s*/g, "").trim();
    // Use pre-drained images if Enter was intercepted in input listener,
    // otherwise drain now (for programmatic submits like /image command).
    let images: ImageContent[] | undefined;
    if (this.drainedSubmitImages) {
      images = this.drainedSubmitImages;
      this.drainedSubmitImages = null;
    } else {
      const drainedImages = this.imagePasteHandler.drainImages();
      images = drainedImages.length > 0 ? drainedImages : undefined;
    }
    // Remove draft blocks before setText("") — onChange guard skips
    // removeImageById, so drafts must be cleaned up here to avoid
    // duplicates when addInlineImage re-adds them later.
    if (images) {
      this.imagePasteHandler.clearDrafts();
    }
    const hasText = text.length > 0;
    const hasImages = Boolean(images?.length);
    const fileRefs = this.drainedSubmitFiles ?? this.fileTracker.drain();
    this.drainedSubmitFiles = null;
    const hasFiles = fileRefs.length > 0;
    if (!hasText && !hasImages && !hasFiles) {
      const now = Date.now();
      if (now - this.lastPasteTime < 100) return;
      this.lastPasteTime = now;
      this.deps.images.readClipboardNonBlocking().then((img) => {
        if (img) {
          this.imagePasteHandler.addImage(img);
          setTimeout(() => this.tui.requestRender(true), 0);
        }
      });
      return;
    }

    this.editor.addToHistory(text);
    this.editor.setText("");

    if (this.permissionExplainMode) {
      this.resolvePermissionChoice({
        decision: "deny",
        denyReason: `User updated the request during permission review: ${text}`,
      });
      this.setProcessing(false);
      this.addUserMessage(text);
      this.setProcessing(true);
      this.deps.conversation.prompt(text).then(
        () => {
          this.setProcessing(false);
        },
        (err) => {
          this.setProcessing(false);
          this.deps.sessions.save();
          this.addError(err instanceof Error ? err.message : String(err));
        },
      );
      return;
    }

    if (this.processing) return;

    if (text.startsWith("/")) {
      const executed = await executeSlashCommand(text, { harness: this.deps, ui: this });
      if (executed) {
        return;
      }
      // Check custom commands
      const expanded = resolveCustomCommand(text, { harness: this.deps, ui: this });
      if (expanded !== undefined) {
        // Treat all custom commands as completion-first: if no args provided,
        // re-populate the editor so the user can type args before submitting.
        const spaceIdx = text.indexOf(" ");
        const cmdName = spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx);
        const manifest = this.deps.commands.get(cmdName);

        // Set title hint with user's actual input so title extraction uses it
        const args = text.slice(spaceIdx + 1).trim();
        if (args) this.deps.sessions.setTitleIntent(args);
        const hasArgs = spaceIdx !== -1 && text.slice(spaceIdx + 1).trim().length > 0;
        if (manifest && !hasArgs) {
          this.editor.setText(text + " ");
          return;
        }
        this.handleSubmit(expanded, this.formatUserEcho(text));
        return;
      }
      // Not a known command — fall through to normal chat handling
    }

    if (text === "exit" || text === "quit") {
      this.stop();
      return;
    }

    // Resolve @file references
    // Capture @path refs before resolution for dedup with fileRefs
    const atPathRe = /@([^\s@]+)/g;
    const atPathAbsPaths = new Set<string>();
    let atRefMatch: RegExpExecArray | null;
    while ((atRefMatch = atPathRe.exec(text)) !== null) {
      const absPath = resolvePath(this.config.projectPath, atRefMatch[1]);
      if (existsSync(absPath)) atPathAbsPaths.add(absPath);
    }
    // Resolve @file references
    const resolved = this.deps.project.resolveAtFiles(text);
    if (resolved.warnings.length > 0) {
      for (const warn of resolved.warnings) {
        this.conversation.addInfo(c.yellow(`@${warn.path ?? ""}: ${warn.type}${warn.detail ? ` — ${warn.detail}` : ""}`));
      }
    }
    if (resolved.reject) {
      return;
    }
    text = resolved.text;
    if (resolved.images.length > 0) {
      const atImages: ImageContent[] = resolved.images.map((img) => ({
        type: "image" as const,
        data: img.data,
        mimeType: img.mimeType,
      }) as ImageContent);
      images = [...(images ?? []), ...atImages];
    }
    // Split fileRefs by type: images vs non-images
    if (hasFiles) {
      let stagedFileRefs: string[];
      try {
        stagedFileRefs = stageAttachedFiles(
          this.config.projectPath,
          this.deps.sessions.currentId() ?? "unscoped",
          fileRefs,
        );
      } catch (error) {
        this.addError(error instanceof Error ? error.message : String(error));
        return;
      }
      const imageRefs = stagedFileRefs.filter((file) =>
        this.deps.project.isImagePath(file)
      );
      const nonImageRefs = stagedFileRefs.filter((file) =>
        !this.deps.project.isImagePath(file)
      );
      // Non-image files: collect for path injection
      const promptFilePaths: string[] = nonImageRefs.length > 0 ? [...nonImageRefs] : [];
      // Image files: resolve with @path dedup
      if (imageRefs.length > 0) {
        const dedupedImageRefs = imageRefs.filter(f => !atPathAbsPaths.has(f));
        if (dedupedImageRefs.length > 0) {
          // Inject image absolute paths into prompt alongside non-image paths
          promptFilePaths.push(...dedupedImageRefs);
          const refsResolved = this.deps.project.resolveFiles(
            dedupedImageRefs,
          );
          if (refsResolved.warnings.length > 0) {
            for (const warn of refsResolved.warnings) {
              this.conversation.addInfo(c.yellow(`${warn.path ?? ""}: ${warn.type}${warn.detail ? ` — ${warn.detail}` : ""}`));
            }
          }
          if (refsResolved.images.length > 0) {
            const refImages: ImageContent[] = refsResolved.images.map((img) => ({
              type: "image" as const,
              data: img.data,
              mimeType: img.mimeType,
            }) as ImageContent);
            images = [...(images ?? []), ...refImages];
          }
        }
      }
      // Inject all file paths in one block (non-image + image, deduped)
      if (promptFilePaths.length > 0) {
        const pathLines = promptFilePaths.map(f => `- \`${f}\``).join('\n');
        text = text ? `${text}\n\n📁 Attached files:\n${pathLines}` : `📁 Attached files:\n${pathLines}`;
      }
    }
    const mainModel = this.deps.settings.modelInfo();
    if (images?.length && !mainModel.supportsImages) {
      this.conversation.addInfo(
        c.dim(`${mainModel.name} does not support image input natively — using vision model or OCR.`),
      );
    }

    const imageIndicator = images
      ? c.dim(`[${images.length} image(s) attached]`)
      : "";
    const userMessage = hasText
      ? imageIndicator ? `${displayText}\n${imageIndicator}` : displayText
      : imageIndicator;
    this.addUserMessage(userMessage);

    // Re-add images as inline images (drafts were removed by editor.setText onChange)
    if (images && images.length > 0) {
      for (const img of images) {
        this.conversation.addInlineImage(img.data, img.mimeType);
      }
    }
    this.setProcessing(true);

    this.imagePasteHandler.updateStatus();

    if (images && images.length > 0) {
      this.deps.conversation.promptWithImages(text, images, displayText).then(
        () => this.setProcessing(false),
        (err) => {
          this.setProcessing(false);
          this.deps.sessions.save();
          this.addError(err instanceof Error ? err.message : String(err));
        },
      );
    } else {
      this.deps.conversation.prompt(text, images ?? undefined).then(
        () => {
          this.setProcessing(false);
        },
        (err) => {
          this.setProcessing(false);
          this.deps.sessions.save();
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

  handleInterrupt(): void {
    this.handleCtrlC();
  }

  focusEditor(): void {
    this.tui.setFocus(this.editor);
  }

  clearConversationView(): void {
    if (this.resolvePermission) {
      this.resolvePermissionChoice({ decision: "deny" });
    }
    if (this.activityInspectorOverlay) {
      this.closeActivityInspector();
    }
    this.persistedAgentResultGeneration++;
    this.persistedAgentResultMessages.clear();
    this.conversation.clear();
    this.permissionExplainMode = false;
    this.pendingPermissionContext = null;
    this.lastMenuNavDirection = null;
    this.lastMenuNavAt = 0;
    this.imagePasteHandler.clear();
    if (this.mcpPanelVisible) {
      this.closeMcpBrowser();
    }
    this.editor.setText("");
    this.editor.disableSubmit = this.processing && !this.permissionExplainMode;
    this.focusEditor();
    this.tui.requestRender(true);
  }

  replayMessages(messages: unknown[]): void {
    const sessionId = this.deps.sessions.currentId() ?? "unknown";
    const agentMessages = this.deps.conversation.snapshot().agentMessages;
    const displayMessages = rebuildDisplayMessages(
      messages as any[],
      [...agentMessages],
      sessionId,
      { resolveImage: (ref) => this.deps.conversation.resolveImage(ref) },
    );
    this.conversation.replayMessages(displayMessages);
    this.preloadPersistedAgentResults(
      agentMessages.map((message) => message.agentId),
    );
    this.activityInspector?.refresh();
  }

  private preloadPersistedAgentResults(agentIds: readonly string[]): void {
    const generation = ++this.persistedAgentResultGeneration;
    this.persistedAgentResultMessages.clear();
    if (agentIds.length === 0) return;
    void this.deps.agents.loadPersisted(agentIds).then((found) => {
      if (generation !== this.persistedAgentResultGeneration) return;
      for (const [agentId, process] of found) {
        const messages = process.runtimeSnapshot?.messages;
        if (Array.isArray(messages)) {
          this.persistedAgentResultMessages.set(agentId, messages);
        }
      }
      this.activityInspector?.refresh();
      this.tui.requestRender(false);
    }).catch(() => {
      // Missing or corrupt Process Store entries remain unavailable to Inspector.
    });
  }

  upsertAgentActivity(activity: import("./shared/types.js").AgentActivity): void {
    this.markActivity();
    this.conversation.upsertAgentActivity(activity);
    this.activityInspector?.refresh();
  }

  addPendingImage(image: ImageContent): void {
    this.imagePasteHandler.addImage(image);
  }

  private formatUserEcho(text: string): string {
    if (text.length <= 80) return text;
    const firstLine = text.split("\n")[0];
    const count = text.length.toLocaleString();
    return `${firstLine}\n${c.dim(`(${count} chars)`)}`;
  }
}
