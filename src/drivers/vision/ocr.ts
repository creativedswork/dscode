import { createWorker, Worker } from "tesseract.js";
import type { ImageContent } from "@earendil-works/pi-ai";

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

export async function ocrImage(image: ImageContent, signal?: AbortSignal): Promise<string> {
  // Check if already aborted before starting
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted", "AbortError");
  }
  const w = await getWorker();
  const dataUrl = `data:${image.mimeType};base64,${image.data}`;

  let aborted = false;
  const onAbort = () => {
    aborted = true;
    w.terminate();
    worker = null;
  };
  signal?.addEventListener("abort", onAbort);

  try {
    const { data } = await w.recognize(dataUrl);
    return data.text.trim();
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }
  }
}

export interface OcrResult {
  hasText: boolean;
  content: string;
}

export async function ocrImages(images: ImageContent[], signal?: AbortSignal): Promise<OcrResult> {
  const results: string[] = [];
  for (const img of images) {
    const text = await ocrImage(img, signal);
    if (text && isUsefulOcrText(text)) {
      results.push(text);
    }
  }
  if (results.length === 0) {
    return { hasText: false, content: "" };
  }
  return { hasText: true, content: results.join("\n\n---\n\n") };
}

export async function shutdownOcr(): Promise<void> {
  const activeWorker = worker;
  worker = null;
  if (activeWorker) await activeWorker.terminate();
}
