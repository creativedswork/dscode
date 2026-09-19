export const INTERNAL_PLAN_EXECUTION_VISIBILITY =
  "internal-plan-execution" as const;

interface VisibilityTaggedMessage {
  dscodeVisibility?: typeof INTERNAL_PLAN_EXECUTION_VISIBILITY;
}

export function markInternalPlanExecutionMessage<T extends object>(
  message: T,
): T & VisibilityTaggedMessage {
  return {
    ...message,
    dscodeVisibility: INTERNAL_PLAN_EXECUTION_VISIBILITY,
  };
}

export function isInternalPlanExecutionMessage(
  message: unknown,
): message is VisibilityTaggedMessage {
  return Boolean(
    message
    && typeof message === "object"
    && (message as VisibilityTaggedMessage).dscodeVisibility
      === INTERNAL_PLAN_EXECUTION_VISIBILITY,
  );
}

export function stripMessageVisibility<T>(message: T): T {
  if (!isInternalPlanExecutionMessage(message)) return message;
  const { dscodeVisibility: _visibility, ...rest } = message;
  return rest as T;
}
