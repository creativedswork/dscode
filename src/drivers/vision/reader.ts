import { readFileSync } from "node:fs";
import { execFile, execFileSync, exec, execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
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
  // JXA (JavaScript for Automation) — lower startup overhead than AppleScript.
  // Uses ObjC bridge to read NSPasteboard directly via AppKit.
  const esc = tmpPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    `ObjC.import('AppKit');`,
    `var pb = $.NSPasteboard.generalPasteboard;`,
    `var imgData = pb.dataForType($.NSPasteboardTypePNG);`,
    `if (!imgData || imgData.isNil()) {`,
    `  imgData = pb.dataForType($.NSPasteboardTypeTIFF);`,
    `  if (imgData && !imgData.isNil()) {`,
    `    var bitmap = $.NSBitmapImageRep.imageRepWithData(imgData);`,
    `    imgData = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, {});`,
    `  }`,
    `}`,
    `if (imgData && !imgData.isNil()) {`,
    `  imgData.writeToFileAtomically("${esc}", true);`,
    `}`,
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

function linuxClipboardCommand(): { cmd: string; args: string[] } | null {
  try {
    execSync("which wl-paste", { stdio: "ignore" });
    return { cmd: "wl-paste", args: ["-t", "image/png"] };
  } catch {
    // Fall through to xclip.
  }
  try {
    execSync("which xclip", { stdio: "ignore" });
    return { cmd: "xclip", args: ["-selection", "clipboard", "-t", "image/png", "-o"] };
  } catch {
    return null;
  }
}

// ── Shared clipboard read logic ──

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
  const tmpPath = join(tmpdir(), `dscode_clipboard_${randomUUID()}.png`);

  try {
    if (process.platform === "darwin") {
      execFileSync("osascript", ["-l", "JavaScript", "-e", darwinClipboardScript(tmpPath)], { stdio: "ignore", timeout: 5000 });
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
  const tmpPath = join(tmpdir(), `dscode_clipboard_${randomUUID()}.png`);

  if (process.platform === "darwin") {
    return new Promise((resolve) => {
      execFile("osascript", ["-l", "JavaScript", "-e", darwinClipboardScript(tmpPath)], { timeout: 5000 }, (err) => {
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
