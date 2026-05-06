import type { PermissionDecision, PermissionRule, PermissionsConfig, PromptUserFn } from "../core/types.js";
import { DEFAULT_RULES } from "./rules.js";

function globToRegex(pattern: string): RegExp {
  let re = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*");
  return new RegExp(`(^|/)${re}($|/)`);
}

export class PermissionManager {
  private rules: PermissionRule[];
  private denyRegexes: { pattern: string; regex: RegExp }[];
  private sessionGrants = new Set<string>();
  private promptUser: PromptUserFn;
  private defaultDecision: PermissionDecision;
  private onBeforePrompt?: () => void;

  constructor(config: PermissionsConfig, promptUser: PromptUserFn, onBeforePrompt?: () => void) {
    this.defaultDecision = config.defaultDecision;
    this.promptUser = promptUser;
    this.onBeforePrompt = onBeforePrompt;
    this.denyRegexes = config.denyPatterns.map((p) => ({ pattern: p, regex: globToRegex(p) }));

    this.rules = [...DEFAULT_RULES];
    for (const rule of config.rules) {
      this.rules.push({
        tool: rule.tool,
        argPattern: rule.argPattern ? new RegExp(rule.argPattern) : undefined,
        decision: rule.decision,
        reason: rule.reason,
        priority: rule.priority ?? 5,
      });
    }
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  async check(
    context: { toolCall: { name: string }; args: unknown },
    _signal?: AbortSignal,
  ): Promise<{ block: boolean; reason: string } | undefined> {
    const toolName = context.toolCall.name;
    const argsStr = JSON.stringify(context.args);

    // check file deny patterns
    if ((toolName === "read_file" || toolName === "write_file") && this.denyRegexes.length > 0) {
      const filePath = (context.args as any)?.path as string | undefined;
      if (filePath) {
        for (const { pattern, regex } of this.denyRegexes) {
          if (regex.test(filePath)) {
            return { block: true, reason: `Denied by file pattern: ${pattern}` };
          }
        }
      }
    }

    if (this.sessionGrants.has(toolName)) {
      return undefined;
    }

    const decision = this.evaluate(toolName, argsStr);

    switch (decision.decision) {
      case "allow":
        return undefined;
      case "deny":
        return { block: true, reason: decision.reason ?? "Denied by policy" };
      case "ask": {
        this.onBeforePrompt?.();
        const preview = this.formatPreview(toolName, context.args);
        const result = await this.promptUser(toolName, preview);
        if (result.rememberForSession) {
          this.sessionGrants.add(toolName);
        }
        if (result.decision === "deny") {
          return { block: true, reason: "Denied by user" };
        }
        return undefined;
      }
    }
  }

  grantForSession(toolName: string): void {
    this.sessionGrants.add(toolName);
  }

  revokeGrant(toolName: string): void {
    this.sessionGrants.delete(toolName);
  }

  getSessionGrants(): string[] {
    return Array.from(this.sessionGrants);
  }

  private evaluate(toolName: string, argsStr: string): { decision: PermissionDecision; reason?: string } {
    for (const rule of this.rules) {
      if (rule.tool !== "*" && rule.tool !== toolName) continue;
      if (rule.argPattern && !rule.argPattern.test(argsStr)) continue;
      return { decision: rule.decision, reason: rule.reason };
    }
    return { decision: this.defaultDecision };
  }

  private formatPreview(toolName: string, args: unknown): string {
    const a = args as Record<string, any>;
    switch (toolName) {
      case "bash":
        return `$ ${a.command ?? ""}`;
      case "write_file": {
        const lines = (a.content ?? "").split("\n");
        const preview = lines.length > 8
          ? lines.slice(0, 8).join("\n") + `\n... (${lines.length} lines)`
          : lines.join("\n");
        return `Write to: ${a.path}\n---\n${preview}`;
      }
      default:
        return JSON.stringify(args, null, 2).slice(0, 300);
    }
  }
}
