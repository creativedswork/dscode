export type AgentHostState =
  | "created"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";

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
