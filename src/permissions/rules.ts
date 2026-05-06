import type { PermissionRule } from "../core/types.js";

export const DEFAULT_RULES: PermissionRule[] = [
  { tool: "read_file", decision: "allow", priority: 10 },
  { tool: "list_files", decision: "allow", priority: 10 },
  { tool: "grep", decision: "allow", priority: 10 },
  { tool: "glob", decision: "allow", priority: 10 },

  // dangerous bash patterns
  { tool: "bash", argPattern: /rm\s+(-[a-zA-Z]*f|--force)/, decision: "deny", reason: "Force-remove blocked", priority: 100 },
  { tool: "bash", argPattern: /sudo\s/, decision: "deny", reason: "sudo blocked", priority: 100 },
  { tool: "bash", argPattern: /chmod\s+777/, decision: "deny", reason: "chmod 777 blocked", priority: 100 },
  { tool: "bash", argPattern: /mkfs|dd\s+if=/, decision: "deny", reason: "Disk operations blocked", priority: 100 },

  // write/bash need confirmation
  { tool: "write_file", decision: "ask", priority: 1 },
  { tool: "bash", decision: "ask", priority: 1 },
];
