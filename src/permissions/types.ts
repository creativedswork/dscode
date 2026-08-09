export type PermissionDecision = "allow" | "deny" | "ask";

export interface PermissionRuleConfig {
  tool: string;
  argPattern?: string;
  decision: PermissionDecision;
  reason?: string;
  priority?: number;
}

export interface PermissionsConfig {
  defaultDecision: PermissionDecision;
  rules: PermissionRuleConfig[];
  denyPatterns: string[];
}

export interface PermissionRule {
  tool: string;
  argPattern?: RegExp;
  decision: PermissionDecision;
  reason?: string;
  priority: number;
}

export interface PermissionPromptResult {
  decision: "allow" | "deny";
  rememberForSession?: boolean;
  persistRule?: PermissionRuleConfig;
  sessionGrantPattern?: string;
  denyReason?: string;
}

export interface PermissionPromptContext {
  agentId?: string;
  toolCallId?: string;
}

export type PromptUserFn = (
  toolName: string,
  preview: string,
  args: unknown,
  context?: PermissionPromptContext,
) => Promise<PermissionPromptResult>;

export interface PermissionPolicyStore {
  persistRule(rule: PermissionRuleConfig): Promise<void>;
}
