import type { AgentSupervisor } from "../../agents/process/supervisor.js";
import type {
  ToolCapability,
  ToolEffect,
} from "../../kernel/tool-effects.js";
import {
  isSideEffectFreePlanOperation,
  resolveToolEffect,
} from "../../kernel/tool-effects.js";
import { PlanExecutionService } from "./execution-service.js";
import { resolveToolResourceScopes } from "./resource-scope.js";
import type { PlanExecutionBinding } from "./types.js";

interface GuardOptions {
  service(): PlanExecutionService;
  supervisor(): AgentSupervisor;
}

interface ToolCall {
  id?: string;
  name: string;
}

interface AuthorizedCall {
  binding: PlanExecutionBinding;
  toolName: string;
  effect: ToolEffect;
  args: unknown;
}

export class ApprovedPlanExecutionGuard {
  private readonly authorized = new Map<string, AuthorizedCall>();

  constructor(private readonly options: GuardOptions) {}

  async beforeToolCall(
    agentId: string,
    tool: ToolCapability | undefined,
    toolCall: ToolCall,
    args: unknown,
  ): Promise<{ block: true; reason: string } | undefined> {
    if (isSideEffectFreePlanOperation(tool)) return undefined;
    const process = this.options.supervisor().get(agentId);
    if (!process?.context.activePlan) return undefined;
    const inherited = process.context.planBinding;
    if (resolveToolEffect(tool) === "read") {
      if (inherited) {
        this.authorized.set(this.key(agentId, toolCall.id), {
          binding: {
            ...inherited,
            agentId,
            role: process.role,
          },
          toolName: toolCall.name,
          effect: "read",
          args,
        });
      }
      return undefined;
    }
    if (!inherited) {
      return {
        block: true,
        reason: "Plan side effect blocked: start and bind an approved Plan item first",
      };
    }
    const binding: PlanExecutionBinding = {
      ...inherited,
      agentId,
      role: process.role,
    };
    const outcome = await this.options.service().authorizeTool({
      binding,
      toolCallId: toolCall.id ?? `${agentId}:${toolCall.name}`,
      toolName: toolCall.name,
      effect: resolveToolEffect(tool),
      resourceScopes: resolveToolResourceScopes(
        toolCall.name,
        resolveToolEffect(tool),
        args,
        process.context.cwd,
      ),
    });
    if (!outcome.ok) {
      return {
        block: true,
        reason: `Plan side effect blocked: ${outcome.reason}: ${outcome.message}`,
      };
    }
    this.authorized.set(this.key(agentId, toolCall.id), {
      binding,
      toolName: toolCall.name,
      effect: resolveToolEffect(tool),
      args,
    });
    return undefined;
  }

  async afterToolCall(
    agentId: string,
    toolCall: ToolCall,
    result: unknown,
    isError: boolean,
  ): Promise<void> {
    const key = this.key(agentId, toolCall.id);
    const authorized = this.authorized.get(key);
    if (!authorized) return;
    this.authorized.delete(key);
    await this.options.service().recordToolResult(
      authorized.binding,
      toolCall.id ?? key,
      authorized.toolName,
      authorized.args,
      result,
      isError,
      authorized.effect,
    );
  }

  async releaseToolCall(agentId: string, toolCall: ToolCall): Promise<void> {
    const key = this.key(agentId, toolCall.id);
    const authorized = this.authorized.get(key);
    if (!authorized) return;
    this.authorized.delete(key);
    if (authorized.effect !== "read") {
      await this.options.service().releaseTool(authorized.binding);
    }
  }

  private key(agentId: string, toolCallId: string | undefined): string {
    return `${agentId}:${toolCallId ?? "unknown"}`;
  }
}
