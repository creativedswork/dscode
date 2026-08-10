import {
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import {
  basename,
  join,
  resolve,
} from "node:path";

import { isCanonicalPathWithin } from "../kernel/path-safety.js";

const MAX_STAGED_FILE_BYTES = 50 * 1024 * 1024;

function safeFilename(path: string): string {
  return basename(path).replace(/[\u0000-\u001f\u007f]/g, "_") || "attachment";
}

/**
 * Copies explicitly attached files into the project sandbox when their source
 * lives outside it. Directories remain absolute path references so attaching a
 * folder never triggers an unbounded recursive copy.
 */
export function stageAttachedFiles(
  projectPath: string,
  sessionId: string,
  paths: readonly string[],
  timestamp = Date.now(),
): string[] {
  const projectRoot = resolve(projectPath);
  const uploadDir = join(projectRoot, ".dscode", "uploads", sessionId);

  return paths.map((path, index) => {
    const source = resolve(path);
    if (!existsSync(source)) {
      throw new Error(`Attached file not found: ${path}`);
    }
    const info = statSync(source);
    if (info.isDirectory()) return source;
    if (!info.isFile()) {
      throw new Error(`Attachment is not a file or directory: ${path}`);
    }
    if (isCanonicalPathWithin(projectRoot, source)) return source;
    if (info.size > MAX_STAGED_FILE_BYTES) {
      throw new Error(
        `Attachment exceeds ${MAX_STAGED_FILE_BYTES} bytes: ${path}`,
      );
    }

    mkdirSync(uploadDir, { recursive: true });
    const staged = join(
      uploadDir,
      `${timestamp}-${index + 1}-${safeFilename(source)}`,
    );
    copyFileSync(source, staged);
    return staged;
  });
}
