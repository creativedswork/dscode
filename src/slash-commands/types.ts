import type { ImageContent } from "@earendil-works/pi-ai";

import type { HarnessAPI } from "../application/harness-api.js";
import type { PendingPermission } from "../session/types.js";

export interface CommandManifest {
  name: string;
  description: string;
  body: string;
  source: "user" | "project";
  path: string;
}

export interface SlashCommandPresenter {
  addInfo(text: string): void;
  addError(text: string): void;
  addPendingImage(image: ImageContent): void;
  clearConversationView(): void;
  openMcpBrowser(): void;
  replayMessages(messages: readonly unknown[]): void;
  takePendingPermission(): PendingPermission | undefined;
}

export interface SlashCommandContext {
  harness: HarnessAPI;
  ui: SlashCommandPresenter;
}

export interface SlashCommandDefinition {
  name: string;
  description: string;
  source?: "builtin" | "custom";
  execute(args: string, context: SlashCommandContext): void | Promise<void>;
}

export interface SlashCommandOption {
  name: string;
  description: string;
}
