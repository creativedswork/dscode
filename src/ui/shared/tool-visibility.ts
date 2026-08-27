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
]);

export function isConversationToolVisible(name: string): boolean {
  return !INTERNAL_CONVERSATION_TOOLS.has(name);
}
