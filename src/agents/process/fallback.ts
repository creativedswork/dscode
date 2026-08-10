import type {
  AgentApplicationSnapshot,
  AgentFailureCode,
} from "../definitions/types.js";
import type {
  AgentProcessInput,
  AgentProcessOutput,
} from "../runtimes/runtime.js";
import { AgentRuntimeFailure } from "../runtimes/runtime.js";

export interface AgentFallbackContext {
  agentId: string;
  application: AgentApplicationSnapshot;
  input: AgentProcessInput;
  failure: AgentRuntimeFailure;
  signal: AbortSignal;
}

export interface AgentFallbackHandler {
  readonly name: string;
  execute(context: AgentFallbackContext): Promise<AgentProcessOutput>;
}

export function classifyAgentFailure(error: unknown): AgentRuntimeFailure | undefined {
  if (error instanceof AgentRuntimeFailure) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/unknown model|model not found|vision model is not configured/i.test(message)) {
    return new AgentRuntimeFailure("model_unavailable", message, {
      cause: error,
    });
  }
  return undefined;
}

export class AgentFallbackRegistry {
  private readonly handlers = new Map<string, AgentFallbackHandler>();

  register(handler: AgentFallbackHandler): void {
    if (this.handlers.has(handler.name)) {
      throw new Error(`Fallback handler already registered: ${handler.name}`);
    }
    this.handlers.set(handler.name, handler);
  }

  async recover(
    application: AgentApplicationSnapshot,
    agentId: string,
    input: AgentProcessInput,
    error: unknown,
    signal: AbortSignal,
  ): Promise<AgentProcessOutput | undefined> {
    const failure = classifyAgentFailure(error);
    if (!failure) return undefined;
    for (const fallback of application.fallback ?? []) {
      if (!fallback.on.includes(failure.code as AgentFailureCode)) continue;
      const handler = this.handlers.get(fallback.handler);
      if (!handler) throw new Error(`Fallback handler is not registered: ${fallback.handler}`);
      return handler.execute({
        agentId,
        application,
        input,
        failure,
        signal,
      });
    }
    return undefined;
  }
}
