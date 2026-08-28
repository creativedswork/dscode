import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { TuiApp } from "../../src/ui/tui/app.js";
import { syncTextareaHeight } from "../../web/src/components/MessageInput.js";

const ROOT = process.cwd();

describe("prompt image attachment feedback", () => {
  it("resets an empty composer after sending a long prompt", () => {
    const textarea = {
      scrollHeight: 200,
      style: { height: "200px" },
    };

    syncTextareaHeight(textarea as any, false);

    expect(textarea.style.height).toBe("");
  });

  it("shows a WebUI preview before image reading and compression completes", () => {
    const source = readFileSync(
      join(ROOT, "web/src/components/MessageInput.tsx"),
      "utf8",
    );
    const queueBody = source.slice(
      source.indexOf("const queueImageFile"),
      source.indexOf("const filteredCommands"),
    );

    expect(queueBody.indexOf("setPendingImages")).toBeGreaterThan(-1);
    expect(queueBody.indexOf("fileToImageAttachment")).toBeGreaterThan(
      queueBody.indexOf("setPendingImages"),
    );
    expect(source).toContain("src={image.previewUrl}");
    expect(source).toContain("Preparing...");
    expect(source).toContain("disabled={!connected || pendingImages.length > 0 ||");
  });

  it("keeps the draft and disables submission while WebUI reconnects", () => {
    const inputSource = readFileSync(
      join(ROOT, "web/src/components/MessageInput.tsx"),
      "utf8",
    );
    const socketSource = readFileSync(
      join(ROOT, "web/src/hooks/useWebSocket.ts"),
      "utf8",
    );

    expect(inputSource).toContain("disabled={processing || !connected}");
    expect(inputSource).toContain("Reconnecting... message will stay here");
    expect(inputSource.indexOf("if (!onSend(")).toBeLessThan(
      inputSource.indexOf('setText("");'),
    );
    expect(socketSource).toContain(
      "if (wsRef.current?.readyState !== WebSocket.OPEN) return false;",
    );
    expect(socketSource).toContain("return true;");
  });

  it("shows TUI preparation status while image data is pending", () => {
    const updateAttachmentBar = TuiApp.prototype["updateAttachmentBar"] as (
      this: any,
    ) => void;
    const setText = vi.fn();
    const requestRender = vi.fn();
    const state = {
      imagePasteHandler: { imageCount: 0 },
      fileTracker: {
        getDisplayPaths: () => [],
        getAll: () => [],
      },
      pendingImageLoads: 1,
      attachmentScrollOffset: 0,
      hoveredFilePath: null,
      imageStatus: { setText },
      tui: { requestRender },
    };

    updateAttachmentBar.call(state);

    expect(setText).toHaveBeenCalledWith(
      expect.stringContaining("Preparing image..."),
    );
    expect(requestRender).toHaveBeenCalledWith(true);
  });

  it("balances TUI preparation state updates", () => {
    const begin = TuiApp.prototype["beginPendingImageLoad"] as (
      this: any,
    ) => void;
    const end = TuiApp.prototype["endPendingImageLoad"] as (
      this: any,
    ) => void;
    const state = {
      pendingImageLoads: 0,
      updateAttachmentBar: vi.fn(),
    };

    begin.call(state);
    expect(state.pendingImageLoads).toBe(1);

    end.call(state);
    end.call(state);
    expect(state.pendingImageLoads).toBe(0);
    expect(state.updateAttachmentBar).toHaveBeenCalledTimes(3);
  });
});
