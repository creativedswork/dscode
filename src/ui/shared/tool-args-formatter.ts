function compactPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const skillMarker = "/skills/";
  const skillIndex = normalized.lastIndexOf(skillMarker);
  if (skillIndex >= 0) {
    return normalized.slice(skillIndex + skillMarker.length);
  }

  const segments = normalized.split("/").filter(Boolean);
  return segments.slice(-3).join("/");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function formatToolArgsForDisplay(
  toolName: string,
  args: unknown,
  maxLength = 160,
): string {
  if (args == null) return "";
  if (typeof args === "string") return truncate(args, maxLength);

  if (typeof args === "object" && !Array.isArray(args)) {
    const values = args as Record<string, unknown>;
    if (typeof values.path === "string") {
      const path = compactPath(values.path);
      const range = typeof values.lineStart === "number"
        ? `:${values.lineStart}${typeof values.lineEnd === "number" ? `-${values.lineEnd}` : ""}`
        : "";
      return truncate(`path="${path}${range}"`, maxLength);
    }
    if (toolName === "skill" && typeof values.name === "string") {
      return truncate(`name="${values.name}"`, maxLength);
    }
  }

  try {
    return truncate(JSON.stringify(args), maxLength);
  } catch {
    return truncate(String(args), maxLength);
  }
}
