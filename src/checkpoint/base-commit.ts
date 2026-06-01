import { execSync } from "node:child_process";

/** Attempt to capture the git HEAD commit hash. Returns "unknown" on failure. */
export function getBaseCommit(projectPath: string): string {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: projectPath,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "unknown";
  }
}
