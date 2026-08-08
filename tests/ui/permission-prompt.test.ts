import { describe, expect, it, vi } from "vitest";

import { PERM_OPTIONS, findPermOptionByKey, navigatePermSelection } from "../../src/ui/conversation.js";
import { TuiApp } from "../../src/ui/tui-app.js";

describe("permission prompt navigation", () => {
  it("wraps when navigating upward from the first option", () => {
    expect(navigatePermSelection(0, -1)).toBe(PERM_OPTIONS.length - 1);
  });

  it("wraps when navigating downward from the last option", () => {
    expect(navigatePermSelection(PERM_OPTIONS.length - 1, 1)).toBe(0);
  });

  it("keeps only allow, always allow, input idea, and deny options", () => {
    expect(PERM_OPTIONS.map((option) => option.value)).toEqual([
      "allow",
      "always_allow",
      "always_allow_save",
      "explain",
      "deny",
    ]);
    expect(PERM_OPTIONS.map((option) => option.label)).toEqual([
      "Allow once",
      "Allow matching calls for this Session",
      "Save matching rule to Settings",
      "Send guidance instead",
      "Deny",
    ]);
  });

  it("maps single-key shortcuts to options", () => {
    expect(findPermOptionByKey("1")?.value).toBe("allow");
    expect(findPermOptionByKey("2")?.value).toBe("always_allow");
    expect(findPermOptionByKey("3")?.value).toBe("always_allow_save");
    expect(findPermOptionByKey("4")?.value).toBe("explain");
    expect(findPermOptionByKey("D")?.value).toBe("deny");
  });

  it("deduplicates rapid repeated menu navigation in the same direction", () => {
    const canNavigateMenu = TuiApp.prototype["canNavigateMenu"] as (this: { lastMenuNavDirection: "up" | "down" | null; lastMenuNavAt: number }, direction: "up" | "down", now?: number) => boolean;
    const state = { lastMenuNavDirection: null, lastMenuNavAt: 0 };

    vi.spyOn(Date, "now")
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(120)
      .mockReturnValueOnce(220);

    expect(canNavigateMenu.call(state, "down")).toBe(true);
    expect(canNavigateMenu.call(state, "down")).toBe(false);
    expect(canNavigateMenu.call(state, "down")).toBe(true);
  });

  it("allows immediate direction changes in menu navigation", () => {
    const canNavigateMenu = TuiApp.prototype["canNavigateMenu"] as (this: { lastMenuNavDirection: "up" | "down" | null; lastMenuNavAt: number }, direction: "up" | "down", now?: number) => boolean;
    const state = { lastMenuNavDirection: null, lastMenuNavAt: 0 };

    vi.spyOn(Date, "now")
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(120)
      .mockReturnValueOnce(140);

    expect(canNavigateMenu.call(state, "down")).toBe(true);
    expect(canNavigateMenu.call(state, "up")).toBe(true);
    expect(canNavigateMenu.call(state, "down")).toBe(true);
  });

  it("does not route old disclosure shortcuts to Conversation state", () => {
    const handleInput = TuiApp.prototype["handleInput"] as (
      this: any,
      data: string,
    ) => boolean;
    const conversation = {
      toggleThinking: vi.fn(),
      selectNextAgent: vi.fn(),
      toggleSelectedAgentTools: vi.fn(),
    };
    const state = {
      permissionExplainMode: false,
      resolvePermission: null,
      mcpPanelVisible: false,
      activityInspectorOverlay: null,
      processing: false,
      fileTracker: { count: 0 },
      imagePasteHandler: { imageCount: 0 },
      pendingImageLoads: 0,
      conversation,
    };

    expect(handleInput.call(state, "\x12")).toBe(false);
    expect(handleInput.call(state, "\x0e")).toBe(false);
    expect(handleInput.call(state, "\x0f")).toBe(false);
    expect(conversation.toggleThinking).not.toHaveBeenCalled();
    expect(conversation.selectNextAgent).not.toHaveBeenCalled();
    expect(conversation.toggleSelectedAgentTools).not.toHaveBeenCalled();
  });

  it("ignores Kitty key releases before toggling the Inspector", () => {
    const handleInput = TuiApp.prototype["handleInput"] as (
      this: any,
      data: string,
    ) => boolean;
    const openActivityInspector = vi.fn();
    const closeActivityInspector = vi.fn();
    const state = {
      permissionExplainMode: false,
      resolvePermission: null,
      mcpPanelVisible: false,
      activityInspectorOverlay: null,
      processing: true,
      openActivityInspector,
      closeActivityInspector,
    };

    expect(handleInput.call(state, "\x1b[101;5:3u")).toBe(true);
    expect(openActivityInspector).not.toHaveBeenCalled();
    expect(closeActivityInspector).not.toHaveBeenCalled();
  });

  it("defers Inspector navigation and Escape to the overlay", () => {
    const handleInput = TuiApp.prototype["handleInput"] as (
      this: any,
      data: string,
    ) => boolean;
    const closeActivityInspector = vi.fn();
    const state = {
      permissionExplainMode: false,
      resolvePermission: null,
      mcpPanelVisible: false,
      activityInspectorOverlay: {},
      processing: true,
      closeActivityInspector,
    };

    expect(handleInput.call(state, "\x1b[B")).toBe(false);
    expect(handleInput.call(state, "\x1b")).toBe(false);
    expect(closeActivityInspector).not.toHaveBeenCalled();

    expect(handleInput.call(state, "\x05")).toBe(true);
    expect(closeActivityInspector).toHaveBeenCalledOnce();
  });

  it("locks Editor input while processing but keeps Ctrl+E available", () => {
    const handleInput = TuiApp.prototype["handleInput"] as (
      this: any,
      data: string,
    ) => boolean;
    const openActivityInspector = vi.fn();
    const state = {
      permissionExplainMode: false,
      resolvePermission: null,
      mcpPanelVisible: false,
      activityInspectorOverlay: null,
      processing: true,
      openActivityInspector,
    };

    expect(handleInput.call(state, "\x1b[A")).toBe(true);
    expect(handleInput.call(state, "draft")).toBe(true);
    expect(handleInput.call(state, "\x05")).toBe(true);
    expect(openActivityInspector).toHaveBeenCalledOnce();
  });

  it("routes direct Permission number and deny keys", () => {
    const handleInput = TuiApp.prototype["handleInput"] as (
      this: any,
      data: string,
    ) => boolean;
    const applyPermissionOption = vi.fn();
    const state = {
      permissionExplainMode: false,
      resolvePermission: vi.fn(),
      handlingPermissionComponentInput: true,
      conversation: {
        isInSubMode: () => false,
        permSelect: vi.fn(),
        justCancelledSubMode: false,
      },
      applyPermissionOption,
    };

    for (const key of ["1", "2", "3", "4", "d"]) {
      expect(handleInput.call(state, key)).toBe(true);
    }
    expect(applyPermissionOption.mock.calls.map((call) => call[0])).toEqual([
      "allow",
      "always_allow",
      "always_allow_save",
      "explain",
      "deny",
    ]);
  });

  it("treats Allow once as an immediate decision without scope selection", () => {
    const applyPermissionOption = TuiApp.prototype["applyPermissionOption"] as (
      this: any,
      option: "allow",
    ) => void;
    const resolvePermissionChoice = vi.fn();
    const conversation = { enterSubMode: vi.fn() };

    applyPermissionOption.call({
      pendingPermissionContext: {
        toolName: "mcp__filesystem__read_file",
        args: { path: "a.ts" },
      },
      conversation,
      resolvePermissionChoice,
    }, "allow");

    expect(resolvePermissionChoice).toHaveBeenCalledWith({ decision: "allow" });
    expect(conversation.enterSubMode).not.toHaveBeenCalled();
  });

  it("resolves permission without appending a permanent conversation message", () => {
    const resolvePermissionChoice = TuiApp.prototype["resolvePermissionChoice"] as (
      this: any,
      result: { decision: "allow" | "deny" },
    ) => void;
    const resolve = vi.fn();
    const conversation = {
      clearPermissionPrompt: vi.fn(),
      addInfo: vi.fn(),
    };
    const state = {
      resolvePermission: resolve,
      pendingPermissionContext: { toolName: "bash", args: { command: "pwd" } },
      permissionExplainMode: false,
      processing: true,
      editor: { disableSubmit: false },
      conversation,
      permissionPreviousFocus: "editor",
      activityInspectorOverlay: null,
      focusEditor: vi.fn(),
      tui: { requestRender: vi.fn() },
    };

    resolvePermissionChoice.call(state, { decision: "allow" });

    expect(resolve).toHaveBeenCalledWith({ decision: "allow" });
    expect(conversation.clearPermissionPrompt).toHaveBeenCalled();
    expect(conversation.addInfo).not.toHaveBeenCalled();
  });

  it("submits input idea even while a tool call is waiting", async () => {
    const handleSubmit = TuiApp.prototype["handleSubmit"] as (this: any, text: string) => Promise<void>;
    const resolvePermissionChoice = vi.fn();
    const setProcessing = vi.fn();
    const addUserMessage = vi.fn();
    const addError = vi.fn();
    const prompt = vi.fn().mockResolvedValue(undefined);
    const state = {
      processing: true,
      permissionExplainMode: true,
      imagePasteHandler: { drainImages: vi.fn().mockReturnValue([]), updateStatus: vi.fn(), imageCount: 0 },
      pendingPermissionContext: { toolName: "write_file", args: { path: "/tmp/test.json" } },
      editor: { setText: vi.fn(), addToHistory: vi.fn() },
      drainedSubmitFiles: [],
      resolvePermissionChoice,
      setProcessing,
      addUserMessage,
      addError,
      deps: { agent: {}, promptAndSave: prompt },
    };

    await handleSubmit.call(state, "写一个 Test.json 吧");

    expect(state.editor.setText).toHaveBeenCalledWith("");
    expect(resolvePermissionChoice).toHaveBeenCalledWith({
      decision: "deny",
      denyReason: "User updated the request during permission review: 写一个 Test.json 吧",
    });
    expect(setProcessing).toHaveBeenNthCalledWith(1, false);
    expect(addUserMessage).toHaveBeenCalledWith("写一个 Test.json 吧");
    expect(setProcessing).toHaveBeenNthCalledWith(2, true);
    expect(prompt).toHaveBeenCalledWith("写一个 Test.json 吧");
    expect(addError).not.toHaveBeenCalled();
  });

  it("keeps submit enabled while input idea mode is active during processing", () => {
    const setProcessing = TuiApp.prototype["setProcessing"] as (this: any, processing: boolean) => void;
    const state = {
      processing: false,
      permissionExplainMode: true,
      editor: { disableSubmit: true },
      idleTimer: undefined,
      idleStartTime: 0,
      lastActivityTime: 0,
      waitSegments: [],
      totalWaitMs: 0,
      tipDuration: 0,
      showTip: false,
      loader: { start: vi.fn(), stop: vi.fn(), setMessage: vi.fn() },
      loaderOverlayHandle: null,
      tui: { showOverlay: vi.fn().mockReturnValue({ hide: vi.fn() }), requestRender: vi.fn() },
      finalizeIdleSegment: vi.fn(),
      formatElapsed: vi.fn().mockReturnValue("0s"),
    };

    setProcessing.call(state, true);

    expect(state.processing).toBe(true);
    expect(state.editor.disableSubmit).toBe(false);
  });

  it("does not create a second processing timer or loader overlay", () => {
    const setProcessing = TuiApp.prototype["setProcessing"] as (
      this: any,
      processing: boolean,
    ) => void;
    const state = {
      processing: true,
      permissionExplainMode: false,
      editor: { disableSubmit: false },
      tui: {
        showOverlay: vi.fn(),
        requestRender: vi.fn(),
      },
    };

    setProcessing.call(state, true);

    expect(state.editor.disableSubmit).toBe(true);
    expect(state.tui.showOverlay).not.toHaveBeenCalled();
    expect(state.tui.requestRender).not.toHaveBeenCalled();
  });

  it("shows only actionable processing shortcuts in tips", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const setProcessing = TuiApp.prototype["setProcessing"] as (
      this: any,
      processing: boolean,
    ) => void;
    const loader = {
      start: vi.fn(),
      stop: vi.fn(),
      setMessage: vi.fn(),
    };
    const state = {
      processing: false,
      permissionExplainMode: false,
      editor: { disableSubmit: false },
      idleTimer: undefined,
      idleStartTime: 0,
      lastActivityTime: 0,
      waitSegments: [],
      totalWaitMs: 0,
      tipDuration: 3500,
      showTip: false,
      loader,
      loaderOverlayHandle: null,
      conversation: { getActiveExecutionStatus: () => undefined },
      tui: {
        showOverlay: vi.fn().mockReturnValue({ hide: vi.fn() }),
        requestRender: vi.fn(),
      },
      finalizeIdleSegment: vi.fn(),
      formatElapsed: vi.fn().mockReturnValue("0s"),
    };

    setProcessing.call(state, true);
    vi.advanceTimersByTime(500);

    expect(loader.setMessage).toHaveBeenCalledWith(
      expect.stringContaining("Ctrl+E to inspect activity"),
    );
    expect(loader.setMessage).not.toHaveBeenCalledWith(
      expect.stringMatching(/Type exit|\/help|twice to exit/),
    );

    setProcessing.call(state, false);
    vi.useRealTimers();
  });

  it("uses the first AI scope when fuzzy arguments are unavailable", () => {
    const applyFuzzySaveOption = TuiApp.prototype["applyFuzzySaveOption"] as (
      this: any,
      index: number,
    ) => void;
    const resolvePermissionChoice = vi.fn();
    const state = {
      pendingPermissionContext: {
        toolName: "mcp__filesystem__read_file",
        args: { path: "a.ts" },
      },
      conversation: {
        activePermission: {
          toolName: "mcp__filesystem__read_file",
          preview: "a.ts",
          fuzzyArgDesc: null,
          llmSuggestions: [{
            label: "Project files",
            toolPattern: "mcp__filesystem__read_file",
            argPattern: "^src/",
          }],
        },
      },
      resolvePermissionChoice,
      saveExactRule: vi.fn(),
    };

    applyFuzzySaveOption.call(state, 2);

    expect(resolvePermissionChoice).toHaveBeenCalledWith({
      decision: "allow",
      rememberForSession: true,
      persistRule: {
        tool: "mcp__filesystem__read_file",
        argPattern: "^src/",
        decision: "allow",
      },
    });
  });

  it("submits image-only messages", async () => {
    const handleSubmit = TuiApp.prototype["handleSubmit"] as (this: any, text: string) => Promise<void>;
    const prompt = vi.fn().mockResolvedValue(undefined);
    const state = {
      imagePasteHandler: {
        drainImages: vi.fn().mockReturnValue([{ type: "image", data: "abcd", mimeType: "image/png" }]),
        updateStatus: vi.fn(),
        imageCount: 1,
        clearDrafts: vi.fn(),
      },
      processing: false,
      permissionExplainMode: false,
      drainedSubmitFiles: [],
      editor: { setText: vi.fn(), addToHistory: vi.fn() },
      deps: {
        agent: { prompt: vi.fn() },
        modelSupportsImages: true,
        modelNeedsOcr: false,
        config: { provider: "openai", modelId: "gpt-4o", atFile: { maxFiles: 5, maxFileSize: 51200, maxTotalSize: 204800 } },
        projectPath: "/tmp",
        onSetCwd: vi.fn(),
        promptWithImages: prompt,
      },
      conversation: { addInfo: vi.fn(), addInlineImage: vi.fn() },
      addUserMessage: vi.fn(),
      setProcessing: vi.fn(),
      addError: vi.fn(),
      stop: vi.fn(),
    };

    await handleSubmit.call(state, "");

    expect(state.editor.setText).toHaveBeenCalledWith("");
    expect(state.addUserMessage).toHaveBeenCalledWith(expect.stringContaining("1 image(s) attached"));
    expect(state.setProcessing).toHaveBeenCalledWith(true);
    expect(state.imagePasteHandler.updateStatus).toHaveBeenCalled();
    expect(prompt).toHaveBeenCalledWith("", [
      { type: "image", data: "abcd", mimeType: "image/png" },
    ], "");
    expect(state.conversation.addInfo).not.toHaveBeenCalled();
  });

  it("does not show image-routing notices for text-only input", async () => {
    const handleSubmit = TuiApp.prototype["handleSubmit"] as (
      this: any,
      text: string,
    ) => Promise<void>;
    const prompt = vi.fn().mockResolvedValue(undefined);
    const conversation = {
      addInfo: vi.fn(),
      addInlineImage: vi.fn(),
    };
    const state = {
      imagePasteHandler: {
        drainImages: vi.fn().mockReturnValue([]),
        updateStatus: vi.fn(),
        imageCount: 0,
      },
      fileTracker: { drain: vi.fn().mockReturnValue([]) },
      processing: false,
      permissionExplainMode: false,
      drainedSubmitFiles: [],
      editor: { setText: vi.fn(), addToHistory: vi.fn() },
      deps: {
        agent: {},
        config: {
          provider: "deepseek",
          modelId: "deepseek-v4-flash",
          projectPath: "/tmp",
          atFile: {
            maxFiles: 5,
            maxFileSize: 51_200,
            maxTotalSize: 204_800,
          },
        },
        promptAndSave: prompt,
        sessionManager: { trySaveSession: vi.fn() },
      },
      conversation,
      addUserMessage: vi.fn(),
      setProcessing: vi.fn(),
      addError: vi.fn(),
      stop: vi.fn(),
    };

    await handleSubmit.call(state, "summarize the attached PDF");

    expect(conversation.addInfo).not.toHaveBeenCalled();
    expect(prompt).toHaveBeenCalledWith(
      "summarize the attached PDF",
      undefined,
    );
  });

  it("resolves historical Agent Tool refs from the preloaded Process Store", () => {
    const resolveToolResultRef = TuiApp.prototype["resolveToolResultRef"] as (
      this: any,
      ref: {
        owner: "agent-process";
        ownerId: string;
        toolCallId: string;
      },
    ) => string | undefined;
    const state = {
      deps: {
        agent: { state: { messages: [] } },
        agentSupervisor: { get: () => undefined },
      },
      persistedAgentResultMessages: new Map([[
        "agent-history",
        [{
          role: "toolResult",
          toolCallId: "call-history",
          content: [{ type: "text", text: "full historical output" }],
        }],
      ]]),
    };

    expect(resolveToolResultRef.call(state, {
      owner: "agent-process",
      ownerId: "agent-history",
      toolCallId: "call-history",
    })).toBe("full historical output");
  });

  it("preloads persisted Agent snapshots for Session replay", async () => {
    const preloadPersistedAgentResults = TuiApp.prototype[
      "preloadPersistedAgentResults"
    ] as (this: any, agentIds: readonly string[]) => void;
    const messages = [{
      role: "toolResult",
      toolCallId: "call-history",
      content: [{ type: "text", text: "full historical output" }],
    }];
    const state = {
      persistedAgentResultGeneration: 0,
      persistedAgentResultMessages: new Map(),
      deps: {
        agentSupervisor: {
          loadPersisted: vi.fn().mockResolvedValue({
            found: new Map([[
              "agent-history",
              { runtimeSnapshot: { messages } },
            ]]),
            missing: [],
          }),
        },
      },
      activityInspector: null,
      tui: { requestRender: vi.fn() },
    };

    preloadPersistedAgentResults.call(state, ["agent-history"]);

    await vi.waitFor(() => {
      expect(state.persistedAgentResultMessages.get("agent-history")).toBe(
        messages,
      );
    });
    expect(state.tui.requestRender).toHaveBeenCalledWith(false);
  });

  it("keeps empty submit as a no-op when there is no text or image", async () => {
    const handleSubmit = TuiApp.prototype["handleSubmit"] as (this: any, text: string) => Promise<void>;
    const state = {
      imagePasteHandler: { drainImages: vi.fn().mockReturnValue([]) },
      drainedSubmitFiles: [],
      editor: { setText: vi.fn(), addToHistory: vi.fn() },
      deps: { agent: { prompt: vi.fn() }, config: { atFile: {} }, projectPath: "/tmp", onSetCwd: vi.fn(), promptWithImages: vi.fn().mockResolvedValue(undefined) },
      addUserMessage: vi.fn(),
      setProcessing: vi.fn(),
    };

    await handleSubmit.call(state, "");

    expect(state.editor.setText).not.toHaveBeenCalled();
    expect(state.addUserMessage).not.toHaveBeenCalled();
    expect(state.setProcessing).not.toHaveBeenCalled();
  });
});
