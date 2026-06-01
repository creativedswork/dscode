import type { Editor, TUI, Text } from "@earendil-works/pi-tui";
import type { ImageContent } from "@mariozechner/pi-ai";
import { ImageManager } from "./image-manager.js";
import type { ConversationView } from "./conversation.js";
import { c } from "./theme.js";

/**
 * Coordinates image lifecycle across ImageManager, Editor,
 * ConversationView, and the image status display.
 *
 * Owns an ImageManager as its single source of truth.
 * TuiApp delegates all image operations to this handler.
 */
export class ImagePasteHandler {
  private static readonly PLACEHOLDER = "[image]";

  constructor(
    private imageManager: ImageManager,
    private editor: Editor,
    private conversation: ConversationView,
    private imageStatus: Text,
    private tui: TUI,
  ) {}

  /** Add an image: push to manager, insert placeholder, render draft, update status. */
  /** Add an image: push to manager, render draft, update status, then insert placeholder last. */
  addImage(img: ImageContent): void {
    this.imageManager.add(img);
    this.conversation.addDraftImage(
      img.data,
      img.mimeType,
      `Image pasted from clipboard (${img.mimeType}, ${Math.round(img.data.length * 0.75 / 1024)} KB)`,
    );
    this.updateStatus();
    // Insert placeholder LAST — matches old addPendingImage order.
    // If insertTextAtCursor triggers onChange, the manager already has the image.
    this.insertPlaceholder();
  }

  /** Remove the most recently added image (LIFO) and its draft blocks. */
  removeLastImage(): void {
    this.imageManager.removeLast();
    this.conversation.removeLastDraftImage();
    this.updateStatus();
  }

  /** Atomically capture all images and clear. Call BEFORE editor.setText("") in handleSubmit. */
  drainImages(): ImageContent[] {
    return this.imageManager.drain();
  }

  /** Number of images currently pending. */
  get imageCount(): number {
    return this.imageManager.count;
  }

  /** Reset all image state. */
  clear(): void {
    this.imageManager.clear();
    this.updateStatus();
  }

  /** Refresh the image status bar text. */
  updateStatus(): void {
    const count = this.imageManager.count;
    if (count > 0) {
      const totalKB = Math.round(
        (this.imageManager.totalBase64Bytes * 0.75) / 1024,
      );
      this.imageStatus.setText(
        c.dim(` ${count} image(s) attached (${totalKB} KB) — type text and press Enter to send`),
      );
    } else {
      this.imageStatus.setText("");
    }
    this.tui.requestRender(true);
  }

  /** Insert [image] placeholder at cursor in the editor. */
  private insertPlaceholder(): void {
    if (this.editor.insertTextAtCursor) {
      this.editor.insertTextAtCursor(ImagePasteHandler.PLACEHOLDER + " ");
    }
  }
}
