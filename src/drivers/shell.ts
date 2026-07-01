import { execSync } from "node:child_process";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

const bashParams = Type.Object({
  command: Type.String({ description: "Shell command to execute" }),
  timeout: Type.Optional(Type.Number({ description: "Timeout in ms (default 30000)" })),
});

export const bashTool: AgentTool<typeof bashParams> = {
  name: "bash",
  label: "Shell",
  description: "Execute a shell command and return stdout/stderr.",
  parameters: bashParams,
  executionMode: "sequential",
  execute: async (_id, { command, timeout }) => {
    const timeoutMs = timeout ?? 30000;
    try {
      const stdout = execSync(command, {
        timeout: timeoutMs,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const output = stdout.slice(0, 10000);
      return {
        content: [{ type: "text", text: output || "(no output)" }],
        details: { exitCode: 0 },
      };
    } catch (err: any) {
      const stdout = (err.stdout ?? "") as string;
      const stderr = (err.stderr ?? "") as string;
      const output = (stdout + "\n" + stderr).trim().slice(0, 10000);
      return {
        content: [{ type: "text", text: output || `Exit code: ${err.status ?? 1}` }],
        details: { exitCode: err.status ?? 1, error: true },
      };
    }
  },
};
