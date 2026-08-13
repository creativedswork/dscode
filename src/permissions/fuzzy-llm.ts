import type { Model, Api, AssistantMessage } from "@earendil-works/pi-ai";
import { complete } from "../models/index.js";

export interface LlmSuggestion {
  /** Human-readable label for the UI, e.g. "All git push commands" */
  label: string;
  /** Glob pattern for the tool name (null = same tool) */
  toolPattern: string | null;
  /** Regex for matching args (null = no arg restriction) */
  argPattern: string | null;
}

export interface PermissionSuggestionPort {
  prefetch(
    model: Model<Api> | null,
    toolName: string,
    args: unknown,
    preview: string,
  ): void;
  get(toolName: string, args: unknown): readonly LlmSuggestion[];
  clear(): void;
}

/** Cache key: `${toolName}:${argsFingerprint}` */
function cacheKey(toolName: string, args: unknown): string {
  const argsStr = typeof args === "string" ? args.slice(0, 80) : JSON.stringify(args).slice(0, 80);
  return `${toolName}:${argsStr}`;
}

export class PermissionSuggestionStore implements PermissionSuggestionPort {
  private readonly suggestions = new Map<string, LlmSuggestion[]>();

  prefetch(
    model: Model<Api> | null,
    toolName: string,
    args: unknown,
    preview: string,
  ): void {
    const key = cacheKey(toolName, args);
    if (this.suggestions.has(key) || !model) return;
    complete(model, {
      systemPrompt: "Respond with JSON only. No explanation.",
      messages: [{
        role: "user",
        content: buildPrompt(toolName, args, preview),
        timestamp: Date.now(),
      }],
    })
      .then((msg: AssistantMessage) => {
        const suggestions = parseSuggestions(msg);
        if (suggestions.length > 0) {
          this.suggestions.set(key, suggestions);
        }
      })
      .catch(() => {
        // Best-effort suggestions must not block permission interaction.
      });
  }

  get(toolName: string, args: unknown): readonly LlmSuggestion[] {
    return this.suggestions.get(cacheKey(toolName, args)) ?? [];
  }

  clear(): void {
    this.suggestions.clear();
  }
}

function buildPrompt(toolName: string, args: unknown, preview: string): string {
  return `The user is granting permission for this tool call. Suggest 1-2 fuzzy patterns that would match similar future calls.

Tool: ${toolName}
Args: ${JSON.stringify(args)}
Preview: ${preview}

Respond with ONLY a JSON array. Each item: {"label":"<human description>","toolPattern":"<glob or null>","argPattern":"<regex or null>"}.
Example for "bash" with "git push origin main":
[{"label":"All git push","toolPattern":null,"argPattern":"^\\"git push"},{"label":"All git commands","toolPattern":null,"argPattern":"^\\"git"}]

Example for "read_file" with path "/src/components/Button.tsx":
[{"label":"All .tsx in components","toolPattern":null,"argPattern":"/src/components/[^\\"]*\\\\.tsx"},{"label":"All files in components","toolPattern":null,"argPattern":"/src/components/"}]

Rules:
- toolPattern: null means same tool. Use "mcp__server__*" only for MCP tools.
- argPattern: regex matching JSON-stringified args. null means no arg restriction.
- Max 2 suggestions. Prefer specific over broad.`;
}

function parseSuggestions(msg: AssistantMessage): LlmSuggestion[] {
  try {
    const text = typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
        : "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s: any) => typeof s.label === "string" && s.label.length > 0 && s.label.length < 60)
      .slice(0, 2) as LlmSuggestion[];
  } catch {
    return [];
  }
}
