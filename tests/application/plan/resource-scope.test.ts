import { describe, expect, it } from "vitest";

import { resolveToolResourceScopes } from "../../../src/application/plan/index.js";

describe("Plan process command scopes", () => {
  it.each([
    "npm test && rm -rf .",
    "npm test || echo ignored",
    "npm test | tee result",
    "npm test > result",
    "npm test; rm file",
    "npm test\nrm file",
    "npm test &",
    "npm $(echo test)",
    "npm `echo test`",
  ])("rejects compound shell syntax in %j", (command) => {
    expect(resolveToolResourceScopes("bash", "process", { command }, "/tmp")).toEqual([]);
  });

  it.each([
    ["npm test \"literal && value\"", "npm"],
    ["\"npm\" test", "npm"],
    ["n\\pm test", "npm"],
    ["NAME=value npm test", "npm"],
    ["npm test \\;", "npm"],
  ])("accepts one quoted or escaped command %j", (command, commandClass) => {
    expect(resolveToolResourceScopes("bash", "process", { command }, "/tmp")).toEqual([{
      kind: "process_command",
      commandClass,
    }]);
  });
});
