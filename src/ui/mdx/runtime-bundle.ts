import { readFileSync } from "node:fs";

import { resolveRuntimeResource } from "../../resources/runtime.js";

let cached: string | null = null;

function findMdxRuntimePath(): string {
  return resolveRuntimeResource("mdx", "mdx-runtime.js");
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
