import { createWorker, Worker } from "tesseract.js";
import type { ImageContent } from "@mariozechner/pi-ai";

let worker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = await createWorker("eng+chi_sim");
  }
  return worker;
}

function isUsefulOcrText(text: string): boolean {
  if (text.length < 5) return false;
  const alphanumCount = (text.match(/[\w一-鿿]/g) || []).length;
  const ratio = alphanumCount / text.length;
  return ratio > 0.4 && alphanumCount > 10;
}

export async function ocrImage(image: ImageContent): Promise<string> {
  const w = await getWorker();
  const dataUrl = `data:${image.mimeType};base64,${image.data}`;
  const { data } = await w.recognize(dataUrl);
  return data.text.trim();
}

export interface OcrResult {
  hasText: boolean;
  content: string;
}

export async function ocrImages(images: ImageContent[]): Promise<OcrResult> {
  const results: string[] = [];
  for (const img of images) {
    const text = await ocrImage(img);
    if (text && isUsefulOcrText(text)) {
      results.push(text);
    }
  }
  if (results.length === 0) {
    return { hasText: false, content: "" };
  }
  return { hasText: true, content: results.join("\n\n---\n\n") };
}
