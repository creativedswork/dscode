import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";

export interface PlanProjectLocation {
  projectKey: string;
  directory: string;
}

export function assertPlanId(planId: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(planId)) {
    throw new Error(`Invalid Plan ID: ${planId}`);
  }
}

export function resolvePlanProjectLocation(
  dataDir: string,
  projectPath: string,
): PlanProjectLocation {
  const canonicalProjectPath = resolve(projectPath);
  const name = basename(canonicalProjectPath)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 80) || "project";
  const hash = createHash("sha256")
    .update(canonicalProjectPath)
    .digest("hex")
    .slice(0, 12);
  const projectKey = `${name}-${hash}`;
  return {
    projectKey,
    directory: join(dataDir, "plans", "by-project", projectKey),
  };
}
