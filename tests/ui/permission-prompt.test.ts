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
      "explain",
      "deny",
    ]);
    expect(PERM_OPTIONS.map((option) => option.label)).toEqual([
      "Allow",
      "Always Allow",
      "Input Idea",
      "Deny",
    ]);
  });

  it("maps single-key shortcuts to options", () => {
    expect(findPermOptionByKey("a")?.value).toBe("always_allow");
    expect(findPermOptionByKey("i")?.value).toBe("explain");
  });

  it("debounces rapid menu navigation", () => {
    const canNavigateMenu = TuiApp.prototype["canNavigateMenu"] as (this: { menuNavDebounceUntil: number }, now?: number) => boolean;
    const state = { menuNavDebounceUntil: 0 };

    vi.spyOn(Date, "now")
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(120)
      .mockReturnValueOnce(220);

    expect(canNavigateMenu.call(state)).toBe(true);
    expect(canNavigateMenu.call(state)).toBe(false);
    expect(canNavigateMenu.call(state)).toBe(true);
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
      pendingPermissionContext: { toolName: "write_file", args: { path: "/tmp/test.json" } },
      editor: { setText: vi.fn() },
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
});
