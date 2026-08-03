import type { AgentApplicationSnapshot } from "../application/types.js";
import type { AgentContext } from "../process/types.js";
import type { AgentProcessRuntime } from "./runtime.js";

export type PiRuntimeFactory = (
  application: AgentApplicationSnapshot,
  context: AgentContext,
  agentId: string,
) => AgentProcessRuntime;

export class AgentProcessRuntimeFactory {
  constructor(private readonly piFactory: PiRuntimeFactory) {}

  create(
    application: AgentApplicationSnapshot,
    context: AgentContext,
    agentId: string,
  ): AgentProcessRuntime {
    return this.piFactory(application, context, agentId);
  }
}
