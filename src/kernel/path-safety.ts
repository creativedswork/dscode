import { existsSync, realpathSync } from "node:fs";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";

export function isPathWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function isCanonicalPathWithin(
  root: string,
  candidate: string,
): boolean {
  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(root);
  } catch {
    return false;
  }

  const target = resolve(candidate);
  let existing = target;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return false;
    existing = parent;
  }

  try {
    const canonicalBase = realpathSync(existing);
    const canonicalTarget = resolve(
      canonicalBase,
      relative(existing, target),
    );
    return isPathWithin(canonicalRoot, canonicalTarget);
  } catch {
    return false;
  }
}
