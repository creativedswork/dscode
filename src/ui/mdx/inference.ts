/**
 * Auto-layout inference engine.
 * Inspects structuredContent shape and generates MDX layout strings.
 * Runs server-side (Node.js) in the harness, not in the browser sandbox.
 */

export interface InferredLayout {
  mdx: string;
}

/**
 * Inspect structuredContent and generate a default MDX layout.
 * Priority: Server override (_ui.mdx) > heuristic inference.
 */
export function inferLayout(
  structuredContent: Record<string, unknown>,
  toolDescription?: string,
): InferredLayout {
  // Check for Server-provided MDX override
  const uiOverride = structuredContent._ui as { mdx?: string } | undefined;
  if (uiOverride?.mdx && typeof uiOverride.mdx === "string" && uiOverride.mdx.trim()) {
    return { mdx: uiOverride.mdx.trim() };
  }

  const dataKeys = Object.keys(structuredContent).filter((k) => k !== "_ui");

  if (dataKeys.length === 0) {
    return { mdx: `<Card title="${escapeAttr(toolDescription ?? "Tool Result")}">No data available</Card>` };
  }

  const lines: string[] = [];
  const title = toolDescription ?? "Tool Result";
  lines.push(`<Card title="${escapeAttr(title)}">`);

  for (const key of dataKeys) {
    const value = structuredContent[key];
    const component = inferComponentForValue(key, value);
    lines.push(`  ${component}`);
  }

  lines.push("</Card>");
  return { mdx: lines.join("\n") };
}

function inferComponentForValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return `<Card title="${escapeAttr(key)}">No data</Card>`;
  }

  if (Array.isArray(value)) {
    return inferArrayComponent(key, value as Record<string, unknown>[]);
  }

  if (typeof value === "object") {
    return inferObjectComponent(key, value as Record<string, unknown>);
  }

  // Scalar — display as Metrics
  return `<Metrics items={${key}} />`;
}

function inferArrayComponent(key: string, arr: Record<string, unknown>[]): string {
  if (arr.length === 0) {
    return `<Card title="${escapeAttr(key)}">Empty list</Card>`;
  }

  const first = arr[0];
  const fields = Object.keys(first);
  const numericFields = fields.filter((f) => typeof first[f] === "number");

  // Rule 3: Array of objects where one field is sequential and others numeric → Chart + Table
  const sequentialField = detectSequentialField(fields, first);
  if (sequentialField && numericFields.length >= 1) {
    const yFields = numericFields.filter((f) => f !== sequentialField);
    if (yFields.length > 0) {
      const yList = yFields.length === 1 ? `"${yFields[0]}"` : `[${yFields.map((f) => `"${f}"`).join(",")}]`;
      return [
        `<Chart type="line" data={${key}} x="${sequentialField}" y={${yList}}/>`,
        `<Table rows={${key}}/>`,
      ].join("\n  ");
    }
  }

  // Rule 2: Array of objects with numeric fields → Table
  if (numericFields.length > 0) {
    return `<Table rows={${key}}/>`;
  }

  // Fallback: just a table
  return `<Table rows={${key}}/>`;
}

function inferObjectComponent(key: string, obj: Record<string, unknown>): string {
  const entries = Object.entries(obj);
  const numericEntries = entries.filter(([, v]) => typeof v === "number");

  // Rule 1: Flat key-value with numeric values → Metrics
  if (numericEntries.length >= entries.length * 0.5 && numericEntries.length >= 2) {
    return `<Metrics items={${key}}/>`;
  }

  // Nested object with arrays → could be compound
  const arrayKeys = entries.filter(([, v]) => Array.isArray(v)).map(([k]) => k);
  const summaryKeys = entries.filter(([, v]) => typeof v === "object" && !Array.isArray(v)).map(([k]) => k);

  if (arrayKeys.length > 0 || summaryKeys.length > 0) {
    const parts: string[] = [`<Card title="${escapeAttr(key)}">`];
    for (const ak of arrayKeys) {
      parts.push(`  ${inferArrayComponent(ak, obj[ak] as Record<string, unknown>[])}`);
    }
    for (const sk of summaryKeys) {
      parts.push(`  ${inferObjectComponent(sk, obj[sk] as Record<string, unknown>)}`);
    }
    parts.push("</Card>");
    return parts.join("\n");
  }

  // Fallback: Metrics for any object
  return `<Metrics items={${key}}/>`;
}

function detectSequentialField(
  fields: string[],
  sampleRow: Record<string, unknown>,
): string | null {
  const sequentialPatterns = ["month", "date", "step", "day", "week", "quarter", "year", "index", "id", "period"];
  for (const f of fields) {
    const lower = f.toLowerCase();
    for (const pattern of sequentialPatterns) {
      if (lower.includes(pattern)) {
        const val = sampleRow[f];
        if (typeof val === "number" || typeof val === "string") {
          return f;
        }
      }
    }
  }
  return null;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
