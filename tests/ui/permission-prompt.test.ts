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
      "Allow",
      "Always Allow",
      "Save to Settings",
      "Input Idea",
      "Deny",
    ]);
  });

  it("maps single-key shortcuts to options", () => {
    expect(findPermOptionByKey("a")?.value).toBe("always_allow");
    expect(findPermOptionByKey("s")?.value).toBe("always_allow_save");
    expect(findPermOptionByKey("i")?.value).toBe("explain");
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

  it("submits input idea even while a tool call is waiting", () => {
    const handleSubmit = TuiApp.prototype["handleSubmit"] as (this: any, text: string) => void;
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
      resolvePermissionChoice,
      setProcessing,
      addUserMessage,
      addError,
      deps: { agent: { prompt } },
    };

    handleSubmit.call(state, "写一个 Test.json 吧");

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

  it("submits image-only messages", () => {
    const handleSubmit = TuiApp.prototype["handleSubmit"] as (this: any, text: string) => void;
    const prompt = vi.fn().mockResolvedValue(undefined);
    const state = {
      imagePasteHandler: {
        drainImages: vi.fn().mockReturnValue([{ type: "image", data: "abcd", mimeType: "image/png" }]),
        updateStatus: vi.fn(),
        imageCount: 1,
      },
      processing: false,
      permissionExplainMode: false,
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

    handleSubmit.call(state, "");

    expect(state.editor.setText).toHaveBeenCalledWith("");
    expect(state.addUserMessage).toHaveBeenCalledWith(expect.stringContaining("1 image(s) attached"));
    expect(state.setProcessing).toHaveBeenCalledWith(true);
    expect(state.imagePasteHandler.updateStatus).toHaveBeenCalled();
    expect(prompt).toHaveBeenCalledWith("", [
      { type: "image", data: "abcd", mimeType: "image/png" },
    ]);
  });

  it("keeps empty submit as a no-op when there is no text or image", () => {
    const handleSubmit = TuiApp.prototype["handleSubmit"] as (this: any, text: string) => void;
    const state = {
      imagePasteHandler: { drainImages: vi.fn().mockReturnValue([]) },
      editor: { setText: vi.fn(), addToHistory: vi.fn() },
      deps: { agent: { prompt: vi.fn() }, config: { atFile: {} }, projectPath: "/tmp", onSetCwd: vi.fn(), promptWithImages: vi.fn().mockResolvedValue(undefined) },
      addUserMessage: vi.fn(),
      setProcessing: vi.fn(),
    };

    handleSubmit.call(state, "");

    expect(state.editor.setText).not.toHaveBeenCalled();
    expect(state.addUserMessage).not.toHaveBeenCalled();
    expect(state.setProcessing).not.toHaveBeenCalled();
  });
});
