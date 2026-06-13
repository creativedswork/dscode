/**
 * Lightweight syntax validation for edited files.
 *
 * Supports: .js, .jsx (esbuild), .ts, .tsx (ts.createSourceFile),
 * .css (esbuild), .json (JSON.parse), .html (tag balance check).
 *
 * Uses lazy loading for esbuild/typescript to avoid bundling issues —
 * these are devDependencies and may not be available at runtime.
 * When unavailable, returns { valid: null, error: "unavailable" }.
 *
 * Non-blocking: results are informational only. File writes are never
 * rolled back due to syntax validation failures.
 */

import { extname } from "node:path";

// --- Public types ---

export interface SyntaxErrorEntry {
  line: number;
  message: string;
}

export interface SyntaxCheckResult {
  valid: boolean | null; // null = timeout/unavailable
  errors?: SyntaxErrorEntry[];
  error?: string; // "timeout" or other meta-error
}

export type SyntaxCheckTarget =
  | { kind: "js" }
  | { kind: "jsx" }
  | { kind: "ts" }
  | { kind: "tsx" }
  | { kind: "css" }
  | { kind: "json" }
  | { kind: "html" };

// --- Supported extensions ---

const SUPPORTED_EXTENSIONS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".css", ".html", ".json",
]);

/** Check if syntax validation is supported for a file path. */
export function isSyntaxCheckSupported(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}

/** Determine the syntax check target kind from file extension. */
export function getSyntaxTarget(filePath: string): SyntaxCheckTarget | null {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".js": return { kind: "js" };
    case ".jsx": return { kind: "jsx" };
    case ".ts": return { kind: "ts" };
    case ".tsx": return { kind: "tsx" };
    case ".css": return { kind: "css" };
    case ".json": return { kind: "json" };
    case ".html": return { kind: "html" };
    default: return null;
  }
}

// --- Lazy loader for optional dependencies ---
let _esbuildTransformSync: any | null | undefined;
let _tsModule: typeof import("typescript") | null | undefined;

async function getEsbuild(): Promise<typeof _esbuildTransformSync> {
  if (_esbuildTransformSync === undefined) {
    try {
      const mod = await import("esbuild");
      _esbuildTransformSync = mod.transformSync;
    } catch {
      _esbuildTransformSync = null;
    }
  }
  return _esbuildTransformSync;
}

async function getTypeScript(): Promise<typeof _tsModule> {
  if (_tsModule === undefined) {
    try {
      _tsModule = await import("typescript");
    } catch {
      _tsModule = null;
    }
  }
  return _tsModule;
}

// --- Main entry point ---

/**
 * Run syntax validation on file content.
 * Returns { valid: true } on success, { valid: false, errors } on failure.
 * Returns { valid: null, error: "unavailable" } if required parser is not available.
 * Never throws — all errors are caught and returned.
 */
export async function validateSyntax(
  filePath: string,
  content: string,
): Promise<SyntaxCheckResult> {
  const target = getSyntaxTarget(filePath);
  if (!target) {
    return { valid: true };
  }

  try {
    switch (target.kind) {
      case "js": return validateJS(content);
      case "jsx": return validateJSX(content);
      case "ts": return await validateTS(content);
      case "tsx": return await validateTSX(content);
      case "css": return validateCSS(content);
      case "json": return validateJSON(content);
      case "html": return validateHTML(content);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      errors: [{ line: 0, message: `Parser error: ${message}` }],
      error: "parser_error",
    };
  }
}

// --- JS/JSX validation via esbuild ---

function validateJS(content: string): SyntaxCheckResult {
  return validateWithEsbuild(content, "js");
}

function validateJSX(content: string): SyntaxCheckResult {
  return validateWithEsbuild(content, "jsx");
}

function validateWithEsbuild(
  content: string,
  loader: "js" | "jsx" | "css",
): SyntaxCheckResult {
  try {
    // Use require for esbuild since we need sync validation
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const esbuild = require("esbuild") as typeof import("esbuild");
    esbuild.transformSync(content, { loader, minify: false });
    return { valid: true };
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ERR_REQUIRE_ESM") {
      // esbuild is ESM-only — can't require. Fall through.
    } else if (err instanceof Error && !String(err).includes("Cannot find module")) {
      // Actual parse error
      return { valid: false, errors: [parseEsbuildError(err)] };
    }
    // Fallback: try sync variant
    try {
      const { transformSync: ts } = require("esbuild") as typeof import("esbuild");
      ts(content, { loader, minify: false });
      return { valid: true };
    } catch (err2: unknown) {
      if (err2 instanceof Error && !String(err2).includes("Cannot find module")) {
        return { valid: false, errors: [parseEsbuildError(err2)] };
      }
      return { valid: null, error: "unavailable" };
    }
  }
}

function parseEsbuildError(err: unknown): SyntaxErrorEntry {
  if (err instanceof Error) {
    const msg = err.message;
    const lineMatch = msg.match(/:(\d+):(\d+):\s*(.+)$/m);
    if (lineMatch) {
      return {
        line: parseInt(lineMatch[1], 10),
        message: lineMatch[3].trim(),
      };
    }
    return { line: 0, message: msg };
  }
  return { line: 0, message: String(err) };
}

// --- TypeScript/TSX validation via ts.createSourceFile ---

async function validateTS(content: string): Promise<SyntaxCheckResult> {
  return validateWithTypeScript(content, "TS");
}

async function validateTSX(content: string): Promise<SyntaxCheckResult> {
  return validateWithTypeScript(content, "TSX");
}

async function validateWithTypeScript(
  content: string,
  _scriptKind: string,
): Promise<SyntaxCheckResult> {
  const tsModule = await getTypeScript();
  if (!tsModule) {
    return { valid: null, error: "unavailable" };
  }

  const scriptKind = _scriptKind === "TSX"
    ? tsModule.ScriptKind.TSX
    : tsModule.ScriptKind.TS;

  const sourceFile = tsModule.createSourceFile(
    "tmp.ts",
    content,
    tsModule.ScriptTarget.Latest,
    /* setParentNodes */ false,
    scriptKind,
  );

  const diagnostics = (sourceFile as any).parseDiagnostics as import("typescript").Diagnostic[];
  if (!diagnostics || diagnostics.length === 0) {
    return { valid: true };
  }

  const errors: SyntaxErrorEntry[] = diagnostics.map((d) => {
    let message = tsModule.flattenDiagnosticMessageText(d.messageText, "\n");
    message = message.replace(/^tmp\.ts\(\d+,\d+\):\s*/, "");
    return {
      line: d.file ? tsModule.getLineAndCharacterOfPosition(d.file, d.start!).line + 1 : 0,
      message,
    };
  });

  return { valid: false, errors };
}

// --- JSON validation via JSON.parse ---

function validateJSON(content: string): SyntaxCheckResult {
  try {
    JSON.parse(content);
    return { valid: true };
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      const msg = err.message;
      const posMatch = msg.match(/position\s+(\d+)/);
      let line = 0;
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        line = content.slice(0, pos).split("\n").length;
      }
      return {
        valid: false,
        errors: [{ line, message: msg }],
      };
    }
    return {
      valid: false,
      errors: [{ line: 0, message: String(err) }],
    };
  }
}

// --- CSS validation via esbuild ---

function validateCSS(content: string): SyntaxCheckResult {
  return validateWithEsbuild(content, "css");
}

// --- HTML tag balance validation ---

const VOID_ELEMENTS = new Set([
  "br", "img", "input", "meta", "link", "hr", "area", "base",
  "col", "embed", "source", "track", "wbr",
]);

const STRUCTURAL_TAGS = new Set([
  "div", "section", "body", "head", "html", "main", "article",
  "nav", "header", "footer", "aside", "form", "table", "ul",
  "ol", "li", "span", "p", "a", "h1", "h2", "h3", "h4", "h5",
  "h6", "pre", "code", "blockquote", "figure", "figcaption",
  "dl", "dt", "dd", "tr", "td", "th", "thead", "tbody", "tfoot",
  "fieldset", "legend", "label", "select", "option", "textarea",
  "button", "script", "style", "template", "slot",
]);

function validateHTML(content: string): SyntaxCheckResult {
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\s*[^>]*\/?>/g;
  const stack: { tag: string; line: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(content)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();

    if (VOID_ELEMENTS.has(tagName)) continue;
    if (!STRUCTURAL_TAGS.has(tagName)) continue;
    if (fullTag.endsWith("/>") && !fullTag.startsWith("</")) continue;

    const isClosing = fullTag.startsWith("</");
    const line = content.slice(0, match.index).split("\n").length;

    if (!isClosing) {
      stack.push({ tag: tagName, line });
    } else {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tagName) {
          stack.splice(i, 1);
          break;
        }
      }
    }
  }

  if (stack.length === 0) {
    return { valid: true };
  }

  const unclosed = stack.pop()!;
  return {
    valid: false,
    errors: [{
      line: unclosed.line,
      message: `Unclosed <${unclosed.tag}> tag (opened at line ${unclosed.line})`,
    }],
  };
}
