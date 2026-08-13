import jpeg from "jpeg-js";
import { PNG } from "pngjs";

export type ImageFormat =
  | "png"
  | "jpeg"
  | "webp"
  | "gif"
  | "bmp"
  | "unknown";

export function detectImageFormat(base64Data: string): ImageFormat {
  const buffer = Buffer.from(base64Data.slice(0, 50), "base64");
  if (buffer.length < 4) return "unknown";
  if (
    buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
  ) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpeg";
  if (
    buffer[0] === 0x52
    && buffer[1] === 0x49
    && buffer[2] === 0x46
    && buffer[3] === 0x46
    && buffer[8] === 0x57
    && buffer[9] === 0x45
    && buffer[10] === 0x42
    && buffer[11] === 0x50
  ) return "webp";
  if (
    buffer[0] === 0x47
    && buffer[1] === 0x49
    && buffer[2] === 0x46
    && buffer[3] === 0x38
  ) return "gif";
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return "bmp";
  return "unknown";
}

export function convertJpegToPng(jpegBase64: string): string | null {
  try {
    const raw = jpeg.decode(Buffer.from(jpegBase64, "base64"), {
      useTArray: true,
    });
    const png = new PNG({ width: raw.width, height: raw.height });
    png.data = Buffer.from(raw.data);
    return PNG.sync.write(png).toString("base64");
  } catch {
    return null;
  }
}
