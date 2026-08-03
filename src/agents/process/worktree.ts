import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface AgentWorktree {
  repositoryRoot: string;
  path: string;
  branch: string;
  baseline: string;
}

export interface AgentWorktreeResult extends AgentWorktree {
  preserved: boolean;
  changed: boolean;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

export class AgentWorktreeManager {
  async create(cwd: string, agentId: string): Promise<AgentWorktree> {
    const root = await git(cwd, ["rev-parse", "--show-toplevel"]);
    const baseline = await git(root, ["rev-parse", "HEAD"]);
    const suffix = agentId.replace(/[^a-zA-Z0-9]/g, "").slice(-12);
    const branch = `dscode-agent/${suffix}`;
    const path = join(root, ".dscode", "worktrees", `agent-${suffix}`);
    await mkdir(join(root, ".dscode", "worktrees"), { recursive: true });
    await git(root, ["worktree", "add", "-b", branch, path, baseline]);
    return { repositoryRoot: root, path, branch, baseline };
  }

  async finalize(worktree: AgentWorktree): Promise<AgentWorktreeResult> {
    const status = await git(worktree.path, ["status", "--porcelain"]);
    const changed = status.length > 0;
    if (changed) {
      return { ...worktree, changed: true, preserved: true };
    }
    await git(worktree.repositoryRoot, ["worktree", "remove", "--force", worktree.path]);
    await git(worktree.repositoryRoot, ["branch", "-D", worktree.branch]);
    return { ...worktree, changed: false, preserved: false };
  }
}
