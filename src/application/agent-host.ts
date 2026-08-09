import type { HarnessAPI, UserInteractionPort } from "./harness-api.js";

export type AgentHostState =
  | "created"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";

export interface AgentHost {
  readonly id: string;
  readonly api: HarnessAPI;
  state(): AgentHostState;
  start(): Promise<void>;
  shutdown(): Promise<void>;
  bindUserInteraction(port: UserInteractionPort): void;
}

export class AgentHostStartError extends Error {
  readonly code = "agent_host_start_failed";

  constructor(
    readonly hostId: string,
    options?: ErrorOptions,
  ) {
    super(`Agent Host ${hostId} failed to start`, options);
    this.name = "AgentHostStartError";
  }
}
