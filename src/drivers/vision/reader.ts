import { readFileSync } from "node:fs";
import { exec, execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImageContent } from "@mariozechner/pi-ai";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

function extToMime(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] ?? "image/png";
}

export async function readImageFile(path: string): Promise<ImageContent> {
  const buf = readFileSync(path);
  const ext = path.slice(path.lastIndexOf("."));
  const mimeType = extToMime(ext);
  return { type: "image" as const, data: buf.toString("base64"), mimeType };
}

function appleScriptExtractClipboardImage(tmpPath: string): string {
  return [
    'set cb to the clipboard as «class PNGf»',
    `set f to open for access POSIX file "${tmpPath}" with write permission`,
    "set eof f to 0",
    "write cb to f",
    "close access f",
  ].join("\n");
}

export async function readClipboardImage(): Promise<ImageContent | null> {
  if (process.platform !== "darwin") return null;

  const tmpPath = join(tmpdir(), "dscode_clipboard.png");
  const script = appleScriptExtractClipboardImage(tmpPath);

  try {
    execSync(`osascript -e '${script}'`, { stdio: "ignore", timeout: 5000 });
  } catch {
    return null;
  }

  const buf = readFileSync(tmpPath);
  if (buf.length === 0) return null;
  return { type: "image" as const, data: buf.toString("base64"), mimeType: "image/png" };
}

export function readClipboardImageNonBlocking(): Promise<ImageContent | null> {
  if (process.platform !== "darwin") return Promise.resolve(null);

  const tmpPath = join(tmpdir(), "dscode_clipboard.png");
  const script = appleScriptExtractClipboardImage(tmpPath);

  return new Promise((resolve) => {
    exec(`osascript -e '${script}'`, { timeout: 5000 }, (err) => {
      if (err) {
        resolve(null);
        return;
      }
      try {
        const buf = readFileSync(tmpPath);
        if (buf.length === 0) {
          resolve(null);
          return;
        }
        resolve({ type: "image" as const, data: buf.toString("base64"), mimeType: "image/png" });
      } catch {
        resolve(null);
      }
    });
  });
}
