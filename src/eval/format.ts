export function formatAgentDisplayId(agentId: string): string {
  const value = agentId.startsWith("agent-") ? agentId.slice(6) : agentId;
  return value.slice(0, 6);
}
