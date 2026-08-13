import type {
  AgentExitResult,
  AgentProcessState,
} from "./types.js";

export type AgentProcessEvent =
  | {
      type: "agent:spawned";
      agentId: string;
      parentAgentId?: string;
      application: string;
      description?: string;
      attachment: "foreground" | "background";
      input: string;
    }
  | {
      type: "agent:state";
      agentId: string;
      previous: AgentProcessState;
      state: AgentProcessState;
    }
  | {
      type: "agent:progress";
      agentId: string;
      phase: string;
      progress?: number;
      total?: number;
      message?: string;
      details?: unknown;
    }
  | { type: "agent:output"; agentId: string; text: string }
  | { type: "agent:exit"; result: AgentExitResult };
