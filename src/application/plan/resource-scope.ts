import { isAbsolute, normalize, resolve } from "node:path";

import type { ToolEffect } from "../../kernel/tool-effects.js";
import { resolveCanonicalPath } from "../../kernel/path-safety.js";
import { parseSimpleShellCommand } from "./shell-command.js";
import type { PlanResourceScope } from "./types.js";

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

export function canonicalizeResourceScope(
  scope: PlanResourceScope,
  cwd: string,
): PlanResourceScope {
  switch (scope.kind) {
    case "workspace_path": {
      const pattern = scope.pattern.trim();
      const absolute = isAbsolute(pattern) ? normalize(pattern) : resolve(cwd, pattern);
      const canonical = resolveCanonicalPath(absolute);
      if (!canonical) throw new Error(`Cannot canonicalize workspace scope: ${pattern}`);
      return { kind: "workspace_path", pattern: normalizeSlashes(canonical) };
    }
    case "process_command":
      return {
        kind: "process_command",
        commandClass: scope.commandClass.trim().toLowerCase(),
      };
    case "network_origin":
      return {
        kind: "network_origin",
        origin: new URL(scope.origin).origin.toLowerCase(),
      };
    case "external_resource":
      return {
        kind: "external_resource",
        resourceType: scope.resourceType.trim().toLowerCase(),
        resourceId: scope.resourceId.trim(),
      };
  }
}

function collectOrigins(value: unknown, origins: Set<string>): void {
  if (typeof value === "string") {
    try {
      origins.add(new URL(value).origin.toLowerCase());
    } catch {
      // Non-URL strings do not identify a network origin.
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectOrigins(item, origins);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectOrigins(item, origins);
    }
  }
}

export function resolveToolResourceScopes(
  toolName: string,
  effect: ToolEffect,
  args: unknown,
  cwd: string,
): PlanResourceScope[] {
  const input = args && typeof args === "object"
    ? args as Record<string, unknown>
    : {};
  if (effect === "workspace_write") {
    const path = typeof input.path === "string"
      ? input.path
      : typeof input.file_path === "string" ? input.file_path : undefined;
    return path
      ? [canonicalizeResourceScope({ kind: "workspace_path", pattern: path }, cwd)]
      : [];
  }
  if (effect === "process") {
    const parsed = toolName === "bash" && typeof input.command === "string"
      ? parseSimpleShellCommand(input.command)
      : { commandClass: toolName };
    if (!parsed) return [];
    return [{
      kind: "process_command",
      commandClass: parsed.commandClass,
    }];
  }
  if (effect === "network") {
    const origins = new Set<string>();
    collectOrigins(args, origins);
    return [...origins].map((origin) => ({ kind: "network_origin", origin }));
  }
  if (effect === "external_write") {
    const resourceId = [input.resourceId, input.id, input.path]
      .find((value): value is string => typeof value === "string") ?? "*";
    return [{
      kind: "external_resource",
      resourceType: toolName.toLowerCase(),
      resourceId,
    }];
  }
  return [];
}

function wildcardMatch(pattern: string, value: string): boolean {
  const expression = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*");
  return new RegExp(`^${expression}$`).test(value);
}

export function resourceScopeCovers(
  grant: PlanResourceScope,
  actual: PlanResourceScope,
): boolean {
  switch (grant.kind) {
    case "workspace_path":
      return actual.kind === "workspace_path"
        && wildcardMatch(grant.pattern, actual.pattern);
    case "process_command":
      return actual.kind === "process_command"
        && wildcardMatch(grant.commandClass, actual.commandClass);
    case "network_origin":
      return actual.kind === "network_origin" && grant.origin === actual.origin;
    case "external_resource":
      return actual.kind === "external_resource"
        && grant.resourceType === actual.resourceType
        && wildcardMatch(grant.resourceId, actual.resourceId);
  }
}
