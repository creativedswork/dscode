/**
 * Single choke-point for formatting tool results into UI display text.
 *
 * Both the Live path (web-backend.ts) and the History path (display.ts)
 * route through this function so that truncation / summarization behavior
 * is consistent regardless of which pipeline produces the output.
 */

const DEFAULT_MAX_CHARS = 2000;

/**
 * Extract a human-readable summary from write_file / overwrite_file results.
 *
 * Expected format:
 *   Written 23577 bytes to /path/index.html
 *   New file version: fv_2a818c68
 *   --- BEGIN ANCHOR PREVIEW ---
 *   …
 *
 * We keep the first two lines (bytes written + file version) and fold the
 * anchor preview into a compact hint.
 */
function extractWriteSummary(text: string): string {
  const lines = text.split("\n");
  // Find the first meaningful lines (skip leading blank lines)
  const meaningful: string[] = [];
  for (const line of lines) {
    if (meaningful.length >= 2) break;
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      meaningful.push(trimmed);
    }
  }
  if (meaningful.length === 0) return text.slice(0, DEFAULT_MAX_CHARS);

  const summary = meaningful.join("\n");
  const remainingLines = lines.length - 2; // rough estimate
  if (remainingLines > 0) {
    return `${summary}\n… (${remainingLines} more lines — anchor preview hidden)`;
  }
  return summary;
}

/**
 * Detect whether a string is valid JSON.
 * Uses a lightweight heuristic (starts with `{` or `[`) followed by JSON.parse.
 */
function isJSON(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pretty-print a JSON string with 2-space indentation.
 */
function prettyPrintJSON(text: string): string {
  return JSON.stringify(JSON.parse(text.trim()), null, 2);
}

/**
 * Wrap text in a markdown code fence, optionally with a language tag.
 */
function formatCodeBlock(text: string, lang?: string): string {
  const fence = lang ? "```" + lang : "```";
  return `${fence}\n${text}\n\`\`\``;
}

/**
 * Truncate text to DEFAULT_MAX_CHARS with a hint if truncated.
 */
function truncate(text: string): string {
  if (text.length <= DEFAULT_MAX_CHARS) return text;
  return text.slice(0, DEFAULT_MAX_CHARS) + `\n… (${text.length - DEFAULT_MAX_CHARS} more chars)`;
}

/**
 * Format a raw tool result string for display in the web UI.
 *
 * Tool-aware: `write_file` / `overwrite_file` get a compact summary with
 * anchor previews folded. `bash`, `grep`, `glob`, `read_file` results are
 * wrapped in Markdown code fences. JSON content is detected and pretty-printed.
 * All other tools fall back to a safe character limit with a truncation hint.
 *
 * @param toolName  The name of the tool that produced the result.
 * @param rawText   The result text (already coerced to string).
 * @returns         Display-ready text, truncated/summarized as appropriate.
 */
export function formatToolResultForUI(toolName: string, rawText: string): string {
  if (!rawText) return "";

  switch (toolName) {
    case "write_file":
    case "overwrite_file":
      return extractWriteSummary(rawText);
    case "bash":
      return formatCodeBlock(truncate(rawText), "sh");
    case "grep":
    case "glob": {
      if (isJSON(rawText)) {
        return formatCodeBlock(truncate(prettyPrintJSON(rawText)), "json");
      }
      return formatCodeBlock(truncate(rawText));
    }
    case "read_file":
      return formatCodeBlock(truncate(rawText));
    default: {
      if (isJSON(rawText)) {
        return formatCodeBlock(truncate(prettyPrintJSON(rawText)), "json");
      }
      return truncate(rawText);
    }
  }
}
