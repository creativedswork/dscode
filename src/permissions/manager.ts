import type {
  PermissionDecision,
  PermissionPolicyStore,
  PermissionRule,
  PermissionsConfig,
  PromptUserFn,
} from "./types.js";
import { DEFAULT_RULES } from "./rules.js";

function globToRegex(pattern: string): RegExp {
  let re = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*");
  return new RegExp(`(^|/)${re}($|/)`);
}

interface SessionGrant {
  pattern: string;
  regex: RegExp | null;
}

export class PermissionPromptQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(prompt: () => Promise<T>): Promise<T> {
    const result = this.tail.then(prompt);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

export class PermissionManager {
  private rules: PermissionRule[];
  private denyRegexes: { pattern: string; regex: RegExp }[];
  private sessionGrants = new Set<string>();
  private sessionGrantPatterns: SessionGrant[] = [];
  private promptUser: PromptUserFn;
  private defaultDecision: PermissionDecision;
  private onBeforePrompt?: () => void;
  private toolPatternCache = new Map<string, RegExp | null>();

  constructor(
    config: PermissionsConfig,
    promptUser: PromptUserFn,
    private readonly policyStore?: PermissionPolicyStore,
    onBeforePrompt?: () => void,
  ) {
    this.promptUser = promptUser;
    this.onBeforePrompt = onBeforePrompt;
    this.defaultDecision = config.defaultDecision;
    this.denyRegexes = [];
    this.rules = [];
    this.updateConfig(config);
  }

  updateConfig(config: PermissionsConfig): void {
    const denyRegexes = config.denyPatterns.map((pattern) => ({
      pattern,
      regex: globToRegex(pattern),
    }));
    const rules = [...DEFAULT_RULES];
    for (const rule of config.rules) {
      rules.push({
        tool: rule.tool,
        argPattern: rule.argPattern ? new RegExp(rule.argPattern) : undefined,
        decision: rule.decision,
        reason: rule.reason,
        priority: rule.priority ?? 5,
      });
    }
    rules.sort((a, b) => b.priority - a.priority);
    this.defaultDecision = config.defaultDecision;
    this.denyRegexes = denyRegexes;
    this.rules = rules;
    this.toolPatternCache.clear();
  }

  async check(
    context: { toolCall: { id?: string; name: string }; args: unknown },
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
    for (const grant of this.sessionGrantPatterns) {
      if (this.matchesTool(grant.pattern, toolName)) {
        return undefined;
      }
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
        const result = await this.promptUser(toolName, preview, context.args, {
          toolCallId: context.toolCall.id,
        });
        if (result.persistRule) {
          await this.policyStore?.persistRule(result.persistRule);
          this.rules.push({
            tool: result.persistRule.tool,
            argPattern: result.persistRule.argPattern ? new RegExp(result.persistRule.argPattern) : undefined,
            decision: result.persistRule.decision,
            reason: result.persistRule.reason,
            priority: result.persistRule.priority ?? 5,
          });
          this.rules.sort((a, b) => b.priority - a.priority);
        }
        if (result.rememberForSession) {
          if (result.sessionGrantPattern) {
            this.sessionGrantPatterns.push({
              pattern: result.sessionGrantPattern,
              regex: result.sessionGrantPattern.includes("*")
                ? this.compileToolPattern(result.sessionGrantPattern)
                : null,
            });
          } else {
            this.sessionGrants.add(toolName);
          }
        }
        if (result.decision === "deny") {
          return { block: true, reason: result.denyReason ?? "Denied by user" };
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
    this.sessionGrantPatterns = this.sessionGrantPatterns.filter(
      (g) => g.pattern !== toolName,
    );
  }

  getSessionGrants(): string[] {
    const exact = Array.from(this.sessionGrants);
    const patterns = this.sessionGrantPatterns.map((g) => g.pattern);
    return [...exact, ...patterns];
  }

  private evaluate(toolName: string, argsStr: string): { decision: PermissionDecision; reason?: string } {
    for (const rule of this.rules) {
      if (!this.matchesTool(rule.tool, toolName)) continue;
      if (rule.argPattern && !rule.argPattern.test(argsStr)) continue;
      return { decision: rule.decision, reason: rule.reason };
    }
    return { decision: this.defaultDecision };
  }

  /** Check if a rule's tool pattern matches a given tool name. */
  private matchesTool(pattern: string, toolName: string): boolean {
    if (pattern === "*") return true;
    if (pattern === toolName) return true;
    // Try glob pattern (contains '*')
    if (pattern.includes("*")) {
      const regex = this.compileToolPattern(pattern);
      if (regex) return regex.test(toolName);
    }
    return false;
  }

  /** Compile a glob pattern to RegExp, caching results. Returns null for invalid patterns. */
  private compileToolPattern(pattern: string): RegExp | null {
    const cached = this.toolPatternCache.get(pattern);
    if (cached !== undefined) return cached;
    try {
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      const regexStr = escaped.replace(/\*/g, ".*");
      const regex = new RegExp(`^${regexStr}$`);
      this.toolPatternCache.set(pattern, regex);
      return regex;
    } catch {
      this.toolPatternCache.set(pattern, null);
      return null;
    }
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
