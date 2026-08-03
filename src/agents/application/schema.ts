import { Type } from "@earendil-works/pi-ai";

export const AgentApplicationFrontmatterSchema = Type.Object({
  name: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  tools: Type.Optional(Type.Array(Type.String())),
  disallowedTools: Type.Optional(Type.Array(Type.String())),
  model: Type.Optional(Type.String()),
  effort: Type.Optional(Type.Union([Type.String(), Type.Number()])),
  permissionMode: Type.Optional(Type.Union([
    Type.Literal("default"),
    Type.Literal("acceptEdits"),
    Type.Literal("plan"),
    Type.Literal("bypassPermissions"),
  ])),
  maxTurns: Type.Optional(Type.Number()),
  skills: Type.Optional(Type.Array(Type.String())),
  initialPrompt: Type.Optional(Type.String()),
  memory: Type.Optional(Type.Union([
    Type.Literal("user"),
    Type.Literal("project"),
    Type.Literal("local"),
  ])),
  background: Type.Optional(Type.Boolean()),
  isolation: Type.Optional(Type.Literal("worktree")),
  color: Type.Optional(Type.String()),
  mcpServers: Type.Optional(Type.Record(Type.String(), Type.Any())),
  hooks: Type.Optional(Type.Record(Type.String(), Type.Any())),
  fallback: Type.Optional(Type.Array(Type.Object({
    handler: Type.String(),
    on: Type.Array(Type.Union([
      Type.Literal("model_unavailable"),
      Type.Literal("model_error"),
      Type.Literal("empty_output"),
    ])),
  }))),
});
