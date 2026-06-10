import type { PermissionDecision, PermissionRule, PermissionRuleConfig, PermissionsConfig, PromptUserFn } from "../core/types.js";
import { loadScopedSettings, projectSettingsPath, saveProjectSettings } from "../core/config.js";
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
  private toolPatternCache = new Map<string, RegExp | null>();

  private projectPath: string;

  constructor(config: PermissionsConfig, promptUser: PromptUserFn, projectPath: string, onBeforePrompt?: () => void) {
    this.projectPath = projectPath;
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
        const result = await this.promptUser(toolName, preview, context.args);
        if (result.persistRule) {
          this.persistRule(result.persistRule);
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
          this.sessionGrants.add(toolName);
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
  }

  getSessionGrants(): string[] {
    return Array.from(this.sessionGrants);
  }

  private persistRule(rule: PermissionRuleConfig): void {
    const settings = loadScopedSettings(projectSettingsPath(this.projectPath));
    const permissions = ((settings.permissions as Record<string, unknown> | undefined) ?? {});

    if (rule.decision === "allow") {
      const allow = Array.isArray(permissions.allow) ? [...permissions.allow] : [];
      if (!allow.includes(rule.tool)) {
        allow.push(rule.tool);
      }
      saveProjectSettings(this.projectPath, {
        ...settings,
        permissions: {
          ...permissions,
          allow,
        },
      });
    } else if (rule.decision === "deny") {
      const deny = Array.isArray(permissions.deny) ? [...permissions.deny] : [];
      if (!deny.includes(rule.tool)) {
        deny.push(rule.tool);
      }
      saveProjectSettings(this.projectPath, {
        ...settings,
        permissions: {
          ...permissions,
          deny,
        },
      });
    }
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
