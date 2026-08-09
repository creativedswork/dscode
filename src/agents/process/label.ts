const DEFAULT_SUBAGENT_LABEL = "SubAgent";
const MAX_SUBAGENT_LABEL_LENGTH = 48;

export function formatSubagentLabel(
  description?: string,
  application?: string,
): string {
  const normalized = description?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return application?.trim().toLowerCase() === "vision"
      ? "Vision"
      : DEFAULT_SUBAGENT_LABEL;
  }

  const separator = normalized.search(/[:：]/);
  const role = (separator > 0 ? normalized.slice(0, separator) : normalized)
    .trim();
  if (!role) return DEFAULT_SUBAGENT_LABEL;
  if (role.length <= MAX_SUBAGENT_LABEL_LENGTH) return role;
  return `${role.slice(0, MAX_SUBAGENT_LABEL_LENGTH - 1).trimEnd()}…`;
}
