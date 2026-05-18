import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cached: string | null = null;

function findMdxRuntimePath(): string {
  const candidates = [
    // Built dist directory (runtime-bundle.js is in dist/ alongside dist/mdx-runtime.js)
    join(process.cwd(), "dist", "mdx-runtime.js"),
    // Source directory (development)
    join(__dirname, "mdx-runtime.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[1]; // Fallback to src path
}

/**
 * Generate the MDX Runtime JS bundle for injection into sandbox.html.
 * Uses the hand-written browser-compatible mdx-runtime.js.
 */
export function generateMdxRuntimeBundle(): string {
  if (cached) return cached;

  cached = readFileSync(findMdxRuntimePath(), "utf-8");
  return cached;
}

export function clearMdxRuntimeCache(): void {
  cached = null;
}
