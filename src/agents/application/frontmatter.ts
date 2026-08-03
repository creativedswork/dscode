import { parse } from "yaml";

export interface ParsedAgentMarkdown {
  attributes: Record<string, unknown>;
  body: string;
}

export function parseAgentMarkdown(content: string): ParsedAgentMarkdown {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { attributes: {}, body: normalized.trim() };
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) {
    throw new Error("Unterminated YAML frontmatter");
  }

  const rawAttributes = parse(normalized.slice(4, end)) as unknown;
  if (!rawAttributes || typeof rawAttributes !== "object" || Array.isArray(rawAttributes)) {
    throw new Error("Agent Application frontmatter must be a YAML object");
  }

  return {
    attributes: rawAttributes as Record<string, unknown>,
    body: normalized.slice(end + 5).trim(),
  };
}

export function stringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
