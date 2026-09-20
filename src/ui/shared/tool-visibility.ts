const INTERNAL_CONVERSATION_TOOLS = new Set([
  "submit_plan_route_assessment",
  "search_tools",
  "skill",
  "spawn_agent",
  "list_agents",
  "terminate_agent",
  "kill_agent",
  "suspend_agent",
  "continue_agent",
  "background_agent",
  "send_agent_message",
  "verify_item",
]);

export function isConversationToolVisible(name: string): boolean {
  return !name.startsWith("plan_") && !INTERNAL_CONVERSATION_TOOLS.has(name);
}

const RETRYABLE_PLAN_COMMAND_CORRECTION =
  "Plan side effect blocked: invalid_command: Run each command separately and exactly as stored:";

export function isConversationToolResultVisible(
  name: string,
  result: string,
  isError: boolean,
): boolean {
  if (name === "spawn_agent" && isError) return true;
  return isConversationToolVisible(name)
    && !(
      name === "bash"
      && isError
      && result.trimStart().startsWith(RETRYABLE_PLAN_COMMAND_CORRECTION)
    );
}
