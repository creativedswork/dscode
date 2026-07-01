import { readFileSync } from "node:fs";
import { execFile, execFileSync, exec, execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";

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

// ── Platform-specific clipboard scripts ──

function darwinClipboardScript(tmpPath: string): string {
  // Use AppKit NSPasteboard — the same API native macOS apps use.
  // Try NSPasteboardTypePNG first, then NSPasteboardTypeTIFF.
  // TIFF must be converted to PNG via NSBitmapImageRep.
  // Single-quote escaping: replace ' with '"'"' for osascript -e
  const esc = tmpPath.replace(/'/g, `'"'"'`);
  return [
    `use framework "AppKit"`,
    `set pb to current application's NSPasteboard's generalPasteboard()`,
    `set imgData to pb's dataForType:(current application's NSPasteboardTypePNG)`,
    `if imgData is missing value then`,
    `  set imgData to pb's dataForType:(current application's NSPasteboardTypeTIFF)`,
    `  if imgData is not missing value then`,
    `    set bitmap to current application's NSBitmapImageRep's imageRepWithData:imgData`,
    `    set imgData to bitmap's representationUsingType:(current application's NSBitmapImageFileTypePNG) |properties|:{}`,
    `  end if`,
    `end if`,
    `if imgData is not missing value then`,
    `  imgData's writeToFile:"${esc}" atomically:true`,
    `end if`,
  ].join("\n");
}

function win32ClipboardScript(tmpPath: string): string {
  // PowerShell in STA mode is required for System.Windows.Forms.Clipboard
  const esc = tmpPath.replace(/'/g, "''");
  return [
    `Add-Type -AssemblyName System.Windows.Forms`,
    `$img = [System.Windows.Forms.Clipboard]::GetImage()`,
    `if ($img) {`,
    `  $img.Save('${esc}', [System.Drawing.Imaging.ImageFormat]::Png)`,
    `  $img.Dispose()`,
    `}`,
  ].join("\n");
}

// ── Linux clipboard support ──

let _linuxTool: "xclip" | "wl-paste" | "none" | null = null;
let _linuxToolChecked = false;

function linuxClipboardCommand(): { cmd: string; args: string[] } | null {
  if (!_linuxToolChecked) {
    _linuxToolChecked = true;
    // Prefer Wayland tool if WAYLAND_DISPLAY is set
    if (process.env.WAYLAND_DISPLAY) {
      try {
        execSync("which wl-paste", { stdio: "ignore" });
        _linuxTool = "wl-paste";
      } catch {
        // fall through to xclip
      }
    }
    if (!_linuxTool) {
      try {
        execSync("which xclip", { stdio: "ignore" });
        _linuxTool = "xclip";
      } catch {
        _linuxTool = "none";
      }
    }
  }

  if (_linuxTool === "wl-paste") {
    return { cmd: "wl-paste", args: ["-t", "image/png"] };
  }
  if (_linuxTool === "xclip") {
    return { cmd: "xclip", args: ["-selection", "clipboard", "-t", "image/png", "-o"] };
  }
  return null;
}

// ── Shared clipboard read logic ──

let _pasteSeq = 0;

function resolveImageFromFile(tmpPath: string): ImageContent | null {
  try {
    const buf = readFileSync(tmpPath);
    if (buf.length === 0) return null;
    return { type: "image" as const, data: buf.toString("base64"), mimeType: "image/png" };
  } catch {
    return null;
  }
}

export async function readClipboardImage(): Promise<ImageContent | null> {
  const tmpPath = join(tmpdir(), `dscode_clipboard_${Date.now()}_${++_pasteSeq}.png`);

  try {
    if (process.platform === "darwin") {
      execFileSync("osascript", ["-e", darwinClipboardScript(tmpPath)], { stdio: "ignore", timeout: 5000 });
    } else if (process.platform === "win32") {
      execFileSync("powershell", ["-Sta", "-NoProfile", "-Command", win32ClipboardScript(tmpPath)], { stdio: "ignore", timeout: 5000 });
    } else if (process.platform === "linux") {
      const lc = linuxClipboardCommand();
      if (!lc) return null;
      execSync(`${lc.cmd} ${lc.args.join(" ")} > ${JSON.stringify(tmpPath)}`, { stdio: "ignore", timeout: 5000 });
    } else {
      return null;
    }
  } catch {
    return null;
  }

  return resolveImageFromFile(tmpPath);
}

/** Non-blocking clipboard image read with unique temp file per call (safe for concurrent pastes). */
export function readClipboardImageNonBlocking(): Promise<ImageContent | null> {
  const tmpPath = join(tmpdir(), `dscode_clipboard_${Date.now()}_${++_pasteSeq}.png`);

  if (process.platform === "darwin") {
    return new Promise((resolve) => {
      execFile("osascript", ["-e", darwinClipboardScript(tmpPath)], { timeout: 5000 }, (err) => {
        if (err) { resolve(null); return; }
        resolve(resolveImageFromFile(tmpPath));
      });
    });
  }

  if (process.platform === "win32") {
    return new Promise((resolve) => {
      execFile("powershell", ["-Sta", "-NoProfile", "-Command", win32ClipboardScript(tmpPath)], { timeout: 5000 }, (err) => {
        if (err) { resolve(null); return; }
        resolve(resolveImageFromFile(tmpPath));
      });
    });
  }

  if (process.platform === "linux") {
    const lc = linuxClipboardCommand();
    if (!lc) return Promise.resolve(null);
    return new Promise((resolve) => {
      exec(`${lc.cmd} ${lc.args.join(" ")} > ${JSON.stringify(tmpPath)}`, { timeout: 5000 }, (err) => {
        if (err) { resolve(null); return; }
        resolve(resolveImageFromFile(tmpPath));
      });
    });
  }

  return Promise.resolve(null);
}
