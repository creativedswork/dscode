import jpeg from "jpeg-js";
import { PNG } from "pngjs";

/** Detected image format from magic bytes, regardless of file extension. */
export type ImageFormat = "png" | "jpeg" | "webp" | "gif" | "bmp" | "unknown";

/**
 * Detect the actual image format from the first bytes of base64 data.
 * Uses magic bytes, not file extension — a WebP named .png will be detected as webp.
 */
export function detectImageFormat(base64Data: string): ImageFormat {
  const buf = Buffer.from(base64Data.slice(0, 50), "base64");
  if (buf.length < 4) return "unknown";
  // PNG: \x89PNG\r\n\x1a\n
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  // JPEG: \xFF\xD8
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  // WebP: RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "webp";
  // GIF: GIF87a or GIF89a
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "gif";
  // BMP: BM
  if (buf[0] === 0x42 && buf[1] === 0x4d) return "bmp";
  return "unknown";
}


/**
 * Convert a JPEG base64 string to PNG base64 string.
 * Returns null if conversion fails (corrupt image, OOM, etc.).
 * Pure JS, synchronous — safe to call inline in rendering paths.
 */
export function convertJpegToPng(jpegBase64: string): string | null {
  try {
    const jpegBuffer = Buffer.from(jpegBase64, "base64");
    const raw = jpeg.decode(jpegBuffer, { useTArray: true });
    const png = new PNG({ width: raw.width, height: raw.height });
    png.data = Buffer.from(raw.data);
    const pngBuffer = PNG.sync.write(png);
    return pngBuffer.toString("base64");
  } catch {
    return null;
  }
}
