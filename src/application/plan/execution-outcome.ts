type Outcome = "success" | "business_error" | "unknown";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : undefined;
}

function explicitError(value: Record<string, unknown> | undefined): boolean {
  return Boolean(value?.error)
    || value?.isError === true
    || value?.ok === false
    || value?.success === false;
}

function explicitSuccess(value: Record<string, unknown> | undefined): boolean {
  return value?.ok === true || value?.success === true;
}

export function classifyToolOutcome(
  result: unknown,
  isError: boolean,
  exitCode: number | undefined,
): Outcome {
  const envelope = record(result);
  const details = record(envelope?.details);
  const mcpResult = record(details?.mcpResult);
  const structured = record(
    details?.structuredContent
      ?? mcpResult?.structuredContent
      ?? envelope?.structuredContent,
  );
  if (
    isError
    || exitCode !== undefined && exitCode !== 0
    || explicitError(details)
    || explicitError(mcpResult)
    || explicitError(structured)
  ) return "business_error";
  if (
    exitCode === 0
    || explicitSuccess(details)
    || explicitSuccess(structured)
  ) return "success";
  return "unknown";
}

export function summarizeToolResult(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
}
