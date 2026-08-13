import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep, basename, isAbsolute } from "node:path";

export interface AtFileLimits {
  maxFiles: number;
  maxFileSize: number;
  maxTotalSize: number;
  maxImageSize: number;
}
export interface AtFileWarning {
  type: "not_found" | "binary_skipped" | "truncated" | "too_many_files" | "total_truncated" | "path_escape";
  path?: string;
  detail?: string;
}

export interface ImageRef {
  data: string;
  mimeType: string;
}

export interface AtFileResolveResult {
  text: string;
  warnings: AtFileWarning[];
  images: ImageRef[];
  reject: boolean;
}

const DEFAULT_LIMITS: AtFileLimits = {
  maxFiles: 5,
  maxFileSize: 50 * 1024,
  maxImageSize: 20 * 1024 * 1024,
  maxTotalSize: 200 * 1024,
};

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".scala",
  ".c", ".cpp", ".h", ".hpp", ".cc", ".hh",
  ".css", ".scss", ".less", ".html", ".xml", ".svg",
  ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg",
  ".md", ".mdx", ".txt", ".log", ".csv",
  ".sh", ".bash", ".zsh", ".fish",
  ".sql", ".graphql", ".gql",
  ".vim", ".lua", ".r", ".pl", ".pm",
  ".dockerfile", ".makefile", ".gitignore", ".env",
  ".d.ts", ".tsbuildinfo",
  "",
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svg",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
  ".exe", ".dll", ".so", ".dylib", ".wasm",
  ".mp3", ".mp4", ".avi", ".mov", ".wav", ".ogg",
  ".ttf", ".otf", ".woff", ".woff2", ".eot",
  ".o", ".a", ".obj", ".class", ".pyc",
  ".db", ".sqlite", ".sqlite3",
  ".lock", ".map",
]);

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp",
]);

const IMAGE_MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

const LANG_MAP: Record<string, string> = {
  ".ts": "typescript", ".tsx": "tsx",
  ".js": "javascript", ".jsx": "jsx", ".mjs": "javascript", ".cjs": "javascript",
  ".py": "python", ".rb": "ruby", ".go": "go", ".rs": "rust",
  ".java": "java", ".kt": "kotlin", ".scala": "scala",
  ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp",
  ".css": "css", ".scss": "scss", ".less": "less",
  ".html": "html", ".xml": "xml", ".svg": "xml",
  ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
  ".md": "markdown", ".mdx": "markdown",
  ".sh": "bash", ".bash": "bash", ".zsh": "bash",
  ".sql": "sql",
  ".graphql": "graphql", ".gql": "graphql",
  ".lua": "lua", ".r": "r",
};

export interface FileListItem {
  path: string;
  name: string;
  isDir: boolean;
  depth: number;
}

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".svn", ".hg",
  ".dscode", "dist", "build", ".next", ".nuxt",
  "__pycache__", ".venv", "venv", ".tox",
  ".cache", ".idea", ".vscode", ".DS_Store",
  "target", ".turbo", ".gradle",
]);

const MAX_WALK_DEPTH = 10;
const MAX_WALK_FILES = 5000;

// ── Path safety ──

function safeResolveWithin(projectPath: string, relPath: string): string | null {
  // Accept absolute paths that point to existing files (for drag-and-drop from outside the project)
  if (isAbsolute(relPath) && existsSync(relPath)) {
    return relPath;
  }
  const resolved = resolve(projectPath, relPath);
  const projectRoot = resolve(projectPath) + sep;
  if (!resolved.startsWith(projectRoot) && resolved !== resolve(projectPath)) {
    return null;
  }
  return resolved;
}

// ── Extension checks ──

function isBinaryExtension(ext: string): boolean {
  return BINARY_EXTENSIONS.has(ext.toLowerCase());
}

function isTextPath(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return false;
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return false;
}

export function isImagePath(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function imageMimeType(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return IMAGE_MIME_MAP[ext] ?? "image/png";
}

function isBinaryContent(buf: Buffer): boolean {
  const sampleSize = Math.min(buf.length, 4096);
  for (let i = 0; i < sampleSize; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function inferLanguage(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return LANG_MAP[ext] ?? "";
}

/**
 * Heuristic: does the captured text look like a file path
 * rather than CJK prose? A capture is treated as a path if it:
 *   - contains a path separator (/ or \), or
 *   - contains a dot followed by 1-6 alphanumeric chars (file extension), or
 *   - contains any ASCII alphanumeric, '-', or '_' (not pure CJK)
 */
function isLikelyFilePath(text: string): boolean {
  // Has path separator
  if (text.includes("/") || text.includes("\\")) return true;
  // Has file extension pattern
  if (/\.[a-zA-Z0-9]{1,6}$/.test(text)) return true;
  // Contains at least one ASCII alphanumeric or common path char
  if (/[a-zA-Z0-9\-_]/.test(text)) return true;
  // Pure CJK without any path indicator → not a path
  return false;
}


/**
 * Simple regex to find all @sequences (without prefix check — prefix
 * validation is done in extractAtPaths to avoid tsx transpiler issues).
 */
const AT_RE = /@([^\s@]+)/g;

function isValidAtPrefix(ch: string | undefined): boolean {
  if (ch === undefined) return true; // start of string
  if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") return true;
  // Non-ASCII characters (CJK, punctuation, etc.) are valid prefixes
  if (ch.charCodeAt(0) > 127) return true;
  // Latin letters and digits are NOT valid prefixes (prevent abc@ref)
  if (/[a-zA-Z0-9]/.test(ch)) return false;
  // Other ASCII: punctuation, symbols — allow
  return true;
}

function extractAtPaths(text: string): string[] {
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = AT_RE.exec(text)) !== null) {
    const prevChar = match.index > 0 ? text[match.index - 1] : undefined;
    if (!isValidAtPrefix(prevChar)) continue;
    const captured = match[1];
    if (isLikelyFilePath(captured)) {
      paths.push(captured);
    }
  }
  return paths;
}
export function resolveAtFileRefs(
  projectPath: string,
  text: string,
  limits: Partial<AtFileLimits> = {},
): AtFileResolveResult {
  const resolvedLimits: AtFileLimits = { ...DEFAULT_LIMITS, ...limits };
  const warnings: AtFileWarning[] = [];
  const images: ImageRef[] = [];
  const atPaths = extractAtPaths(text);

  if (atPaths.length === 0) {
    return { text, warnings, images, reject: false };
  }

  const resolvedPaths: string[] = [];
  for (const p of atPaths) {
    if (resolvedPaths.length >= resolvedLimits.maxFiles) {
      warnings.push({
        type: "too_many_files",
        detail: `Skipped ${atPaths.length - resolvedPaths.length} file(s): ${atPaths.slice(resolvedPaths.length).join(", ")}`,
      });
      break;
    }
    resolvedPaths.push(p);
  }

  let totalContentSize = 0;
  for (const relPath of resolvedPaths) {
    const fullPath = safeResolveWithin(projectPath, relPath);
    if (!fullPath) {
      warnings.push({ type: "path_escape", path: relPath, detail: "Path escapes project directory" });
      continue;
    }

    if (!existsSync(fullPath)) {
      warnings.push({ type: "not_found", path: relPath });
      continue;
    }

    // Handle image files — read as base64 and append to images array
    if (isImagePath(relPath)) {
      let buf: Buffer;
      try {
        buf = readFileSync(fullPath);
      } catch {
        warnings.push({ type: "not_found", path: relPath });
        continue;
      }
      if (buf.length > resolvedLimits.maxImageSize) {
        warnings.push({ type: "truncated", path: relPath, detail: `Image exceeds ${resolvedLimits.maxImageSize} bytes` });
        return { text, warnings, images, reject: true };
      }
      images.push({
        data: buf.toString("base64"),
        mimeType: imageMimeType(relPath),
      });
      // Replace @path with an image indicator in the text
      const escapedPath = relPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pathRegex = new RegExp(`(?:^|(?<![a-zA-Z0-9]))@${escapedPath}(?!\\S)`, "g");
      text = text.replace(pathRegex, `[Image: @${relPath}]`);
      continue;
    }

    if (!isTextPath(relPath)) {
      warnings.push({ type: "binary_skipped", path: relPath, detail: "Binary or non-text file" });
      continue;
    }

    let buf: Buffer;
    try {
      buf = readFileSync(fullPath);
    } catch {
      warnings.push({ type: "not_found", path: relPath });
      continue;
    }

    if (isBinaryContent(buf)) {
      warnings.push({ type: "binary_skipped", path: relPath, detail: "Binary or non-text file" });
      continue;
    }

    let content = buf.toString("utf8");
    let wasTruncated = false;

    if (buf.length > resolvedLimits.maxFileSize) {
      content = content.slice(0, resolvedLimits.maxFileSize);
      warnings.push({ type: "truncated", path: relPath, detail: `File truncated at ${resolvedLimits.maxFileSize} bytes` });
      wasTruncated = true;
    }

    const remainingTotal = resolvedLimits.maxTotalSize - totalContentSize;
    if (content.length > remainingTotal) {
      content = content.slice(0, remainingTotal);
      const allTruncated = resolvedPaths.slice(resolvedPaths.indexOf(relPath)).join(", ");
      warnings.push({
        type: "total_truncated",
        detail: `Total file content truncated at ${resolvedLimits.maxTotalSize} bytes. Skipped: ${allTruncated}`,
      });
      wasTruncated = true;
    }

    totalContentSize += content.length;

    const lang = inferLanguage(relPath);
    const langTag = lang ? ` ${lang}` : "";
    const truncNote = wasTruncated ? " [...truncated...]" : "";
    const block = `\`${relPath}\`:\n\`\`\`${langTag}\n${content}${truncNote}\n\`\`\``;

    const escapedPath = relPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pathRegex = new RegExp(`(?:^|(?<![a-zA-Z0-9]))@${escapedPath}(?!\\S)`, "g");
    text = text.replace(pathRegex, block);
  }

  return { text, warnings, images, reject: false };
}


// ── Shared internal file path resolver ──
// Resolves an explicit array of file paths (absolute or relative) into
// an array of text blocks (for code files) and a parallel ImageRef array.

interface ResolvedBlocks {
  blocks: string[];
  warnings: AtFileWarning[];
  images: ImageRef[];
  reject: boolean;
}

function resolveFilePathsInternal(
  projectPath: string,
  paths: string[],
  limits: AtFileLimits,
): ResolvedBlocks {
  const warnings: AtFileWarning[] = [];
  const images: ImageRef[] = [];
  const blocks: string[] = [];

  const resolvedPaths = paths.slice(0, limits.maxFiles);
  if (paths.length > limits.maxFiles) {
    warnings.push({
      type: "too_many_files",
      detail: `Skipped ${paths.length - limits.maxFiles} file(s): ${paths.slice(limits.maxFiles).join(", ")}`,
    });
  }

  let totalContentSize = 0;
  for (const relPath of resolvedPaths) {
    const fullPath = safeResolveWithin(projectPath, relPath);
    if (!fullPath) {
      warnings.push({ type: "path_escape", path: relPath, detail: "Path escapes project directory" });
      continue;
    }

    if (!existsSync(fullPath)) {
      warnings.push({ type: "not_found", path: relPath });
      continue;
    }

    // Handle image files — read as base64
    if (isImagePath(relPath)) {
      let buf: Buffer;
      try {
        buf = readFileSync(fullPath);
      } catch {
        warnings.push({ type: "not_found", path: relPath });
        continue;
      }
      if (buf.length > limits.maxImageSize) {
        warnings.push({ type: "truncated", path: relPath, detail: `Image exceeds ${limits.maxImageSize} bytes` });
        return { blocks, warnings, images, reject: true };
      }
      images.push({
        data: buf.toString("base64"),
        mimeType: imageMimeType(relPath),
      });
      blocks.push(`[Image: @${relPath}]`);
      continue;
    }

    if (!isTextPath(relPath)) {
      warnings.push({ type: "binary_skipped", path: relPath, detail: "Binary or non-text file" });
      continue;
    }

    let buf: Buffer;
    try {
      buf = readFileSync(fullPath);
    } catch {
      warnings.push({ type: "not_found", path: relPath });
      continue;
    }

    if (isBinaryContent(buf)) {
      warnings.push({ type: "binary_skipped", path: relPath, detail: "Binary or non-text file" });
      continue;
    }

    let content = buf.toString("utf8");
    let wasTruncated = false;

    if (buf.length > limits.maxFileSize) {
      content = content.slice(0, limits.maxFileSize);
      warnings.push({ type: "truncated", path: relPath, detail: `File truncated at ${limits.maxFileSize} bytes` });
      wasTruncated = true;
    }

    const remainingTotal = limits.maxTotalSize - totalContentSize;
    if (content.length > remainingTotal) {
      content = content.slice(0, remainingTotal);
      const allTruncated = resolvedPaths.slice(resolvedPaths.indexOf(relPath)).join(", ");
      warnings.push({
        type: "total_truncated",
        detail: `Total file content truncated at ${limits.maxTotalSize} bytes. Skipped: ${allTruncated}`,
      });
      wasTruncated = true;
    }

    totalContentSize += content.length;

    const lang = inferLanguage(relPath);
    const langTag = lang ? ` ${lang}` : "";
    const truncNote = wasTruncated ? " [...truncated...]" : "";
    blocks.push(`\`${relPath}\`:\n\`\`\`${langTag}\n${content}${truncNote}\n\`\`\``);
  }

  return { blocks, warnings, images, reject: false };
}

/**
 * Resolve an explicit array of file paths into message content.
 * Unlike resolveAtFileRefs, this does NOT scan text for @path patterns —
 * it takes a pre-built array of absolute or relative paths (e.g., from
 * drag-and-drop tracker).
 */
export function resolveFileRefs(
  projectPath: string,
  fileRefs: string[],
  limits?: Partial<AtFileLimits>,
): AtFileResolveResult {
  if (fileRefs.length === 0) {
    return { text: "", warnings: [], images: [], reject: false };
  }

  const resolvedLimits: AtFileLimits = { ...DEFAULT_LIMITS, ...limits };
  const { blocks, warnings, images, reject } = resolveFilePathsInternal(
    projectPath,
    fileRefs,
    resolvedLimits,
  );

  const text = blocks.join("\n\n");
  return { text, warnings, images, reject };
}

// ── File search for autocomplete ──

function isIgnoredPath(parts: string[]): boolean {
  return parts.some((p) => IGNORE_DIRS.has(p));
}

function safeRelativePath(projectPath: string, fullPath: string): string | null {
  try {
    const rel = relative(projectPath, fullPath);
    if (rel.startsWith("..") || rel.startsWith("/")) return null;
    return rel;
  } catch {
    return null;
  }
}

function collectWalkEntries(
  dir: string,
  projectPath: string,
  maxFiles: number,
  depth: number,
  visited: Set<string>,
): { fullPath: string; relativePath: string; isDir: boolean; depth: number }[] {
  if (depth > MAX_WALK_DEPTH || visited.size >= maxFiles) return [];

  const realPath = resolve(dir);
  if (visited.has(realPath)) return [];
  visited.add(realPath);

  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: { fullPath: string; relativePath: string; isDir: boolean; depth: number }[] = [];

  for (const entry of entries) {
    if (visited.size >= maxFiles) break;

    const name = entry.name;
    if (IGNORE_DIRS.has(name)) continue;

    const fullPath = join(dir, name);
    const relativePath = safeRelativePath(projectPath, fullPath);
    if (!relativePath) continue;

    if (entry.isDirectory() && name.startsWith(".")) continue;

    let isDir = entry.isDirectory();
    try {
      const realFull = resolve(fullPath);
      if (visited.has(realFull)) continue;
      visited.add(realFull);
      if (!entry.isDirectory() && entry.isSymbolicLink()) {
        isDir = statSync(fullPath).isDirectory();
      }
    } catch {
      continue;
    }

    if (isDir) {
      results.push({ fullPath, relativePath, isDir: true, depth });
      const childEntries = collectWalkEntries(fullPath, projectPath, maxFiles, depth + 1, visited);
      results.push(...childEntries);
    } else {
      results.push({ fullPath, relativePath, isDir: false, depth });
    }
  }

  return results;
}

// ── Scoring ──

function fuzzyScore(path: string, name: string, query: string, isDir: boolean): number {
  const lowerName = name.toLowerCase();
  const lowerPath = path.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let score = 0;

  if (lowerName === lowerQuery) {
    score = 100;
  }
  else if (lowerName.startsWith(lowerQuery)) {
    score = 80;
  }
  else if (lowerName.includes(lowerQuery)) {
    score = 50;
  }
  else if (isAbbreviationMatch(name, query)) {
    score = 40;
  }
  else if (lowerPath.includes(lowerQuery)) {
    score = 30;
  }
  else if (isCharSequenceMatch(lowerName, lowerQuery)) {
    score = 20;
  }

  if (isDir && score > 0) score += 10;
  return score;
}

function isAbbreviationMatch(name: string, query: string): boolean {
  const queryLower = query.toLowerCase();
  const upperChars = name.replace(/[^A-Z]/g, "");
  if (upperChars.toLowerCase().startsWith(queryLower)) return true;

  const segments = name.split(/[-_.]/);
  const initials = segments.map((s) => s[0] ?? "").join("");
  if (initials.toLowerCase().startsWith(queryLower)) return true;

  return false;
}

function isCharSequenceMatch(target: string, query: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

// ── Public API ──

export function fuzzySearchFiles(
  projectPath: string,
  query: string,
  maxResults = 20,
): FileListItem[] {
  if (!existsSync(projectPath)) return [];

  const rawQuery = query.trim();
  const visited = new Set<string>();

  const allEntries = collectWalkEntries(projectPath, projectPath, MAX_WALK_FILES, 0, visited);

  if (rawQuery.length === 0) {
    const topLevel = allEntries.filter((e) => e.depth <= 1);
    topLevel.sort(compareByDirAndRelativePath);
    return topLevel.slice(0, maxResults).map(toFileListItem);
  }

  const scored = allEntries
    .map((e) => ({ ...e, score: fuzzyScore(e.relativePath, basename(e.relativePath), rawQuery, e.isDir) }))
    .filter((e) => e.score > 0);

  scored.sort((a, b) => b.score - a.score || compareRaw(a, b));
  return scored.slice(0, maxResults).map(toFileListItem);
}

export function listDirectory(
  projectPath: string,
  prefix: string,
  maxResults = 50,
): FileListItem[] {
  const normalized = prefix.replace(/\\/g, "/");
  const slashIdx = normalized.lastIndexOf("/");
  const dirPart = slashIdx >= 0 ? normalized.slice(0, slashIdx) : "";
  const filePart = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized;

  const searchDir = safeResolveWithin(projectPath, dirPart || ".");
  if (!searchDir || !existsSync(searchDir)) return [];

  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(searchDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: FileListItem[] = [];
  for (const entry of entries) {
    const name = entry.name;
    if (IGNORE_DIRS.has(name)) continue;
    if (entry.isDirectory() && name.startsWith(".")) continue;

    if (filePart && !name.toLowerCase().startsWith(filePart.toLowerCase())) continue;

    let isDir = entry.isDirectory();
    try {
      if (!entry.isDirectory() && entry.isSymbolicLink()) {
        isDir = statSync(join(searchDir, name)).isDirectory();
      }
    } catch {
      continue;
    }

    const relativePath = dirPart ? `${dirPart}/${name}` : name;
    results.push({
      path: relativePath,
      name,
      isDir,
      depth: dirPart ? dirPart.split("/").length + 1 : 1,
    });
  }

  results.sort(compareEntries);
  return results.slice(0, maxResults);
}

export function listProjectFiles(
  projectPath: string,
  prefix: string,
  maxResults = 50,
): FileListItem[] {
  const normalized = prefix.replace(/\\/g, "/");

  if (normalized.includes("/") || normalized.includes("\\")) {
    return listDirectory(projectPath, normalized, maxResults);
  }

  return fuzzySearchFiles(projectPath, normalized, maxResults);
}

function compareByDirAndRelativePath(a: { isDir: boolean; relativePath: string }, b: { isDir: boolean; relativePath: string }): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.relativePath.localeCompare(b.relativePath);
}

function compareEntries(a: { isDir: boolean; path: string }, b: { isDir: boolean; path: string }): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.path.localeCompare(b.path);
}

function compareRaw(a: { isDir: boolean; relativePath: string }, b: { isDir: boolean; relativePath: string }): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.relativePath.localeCompare(b.relativePath);
}

function toFileListItem(e: { relativePath: string; isDir: boolean; depth: number }): FileListItem {
  return {
    path: e.relativePath,
    name: basename(e.relativePath),
    isDir: e.isDir,
    depth: e.depth,
  };
}
