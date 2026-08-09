import type { HarnessAPI } from "./harness-api.js";

function supportedSurface(api: HarnessAPI): void {
  api.conversation.snapshot();
  api.sessions.list();
  api.settings.get();
  api.skills.list();
  api.mcp.list();
  api.agents.list();
  api.events.on("turn:end", () => {});
}

function rejectedImplementationSurface(api: HarnessAPI): void {
  // @ts-expect-error Concrete Agent runtime is not part of the facade.
  void api.agent;
  // @ts-expect-error Concrete Managers are not part of the facade.
  void api.sessionManager;
  // @ts-expect-error Registries are internal composition details.
  void api.driverRegistry;
  // @ts-expect-error Supervisors are accessed through Agent process commands.
  void api.agentSupervisor;
  // @ts-expect-error Runtime configuration stores are internal.
  void api.configStore;
  // @ts-expect-error Presentation receives a subscribe-only event source.
  api.events.emit({ type: "turn:start" });
  // @ts-expect-error Presentation cannot clear Application subscriptions.
  api.events.clear();
}

void supportedSurface;
void rejectedImplementationSurface;
