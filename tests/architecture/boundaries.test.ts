import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  classifySource,
  evaluateDependency,
  evaluateSourcePath,
  relativeImportTarget,
} from "../../scripts/architecture/rules.mjs";

interface DependencyFixture {
  name: string;
  from: string;
  to: string;
  typeOnly?: boolean;
  rules: string[];
}

const fixtures = JSON.parse(readFileSync(
  join(process.cwd(), "tests", "architecture", "fixtures", "dependencies.json"),
  "utf8",
)) as DependencyFixture[];

describe("architecture boundary rules", () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const rules = evaluateDependency(fixture.from, fixture.to, {
        typeOnly: fixture.typeOnly,
      })
        .map((item) => item.rule);
      expect(rules).toEqual(fixture.rules);
    });
  }

  it("classifies the architectural rings", () => {
    expect(classifySource("src/bootstrap/cli-main.ts")).toBe("bootstrap");
    expect(classifySource("src/kernel/execution-context.ts")).toBe("kernel");
    expect(classifySource("src/application/harness.ts")).toBe("application");
    expect(classifySource("src/agents/definitions/compiler.ts")).toBe("feature");
    expect(classifySource("src/slash-commands/builtins.ts")).toBe("feature");
    expect(classifySource("src/project-files/resolver.ts")).toBe("feature");
    expect(classifySource("src/agents/process/supervisor.ts")).toBe("feature");
    expect(classifySource("src/integrations/open-design/index.ts")).toBe("adapter");
    expect(classifySource("src/session/store.ts")).toBe("persistence");
    expect(classifySource("src/ui/tui/app.ts")).toBe("presentation");
    expect(classifySource("src/unowned/example.ts")).toBe("unknown");
  });

  it("normalizes relative runtime import specifiers", () => {
    expect(relativeImportTarget(
      "src/agents/runtimes/pi-agent-runtime.ts",
      "../../ui/shared/types.js",
    )).toBe("src/ui/shared/types.js");
    expect(relativeImportTarget("src/application/harness.ts", "node:path")).toBeUndefined();
  });

  it("rejects unknown and catch-all source roots", () => {
    expect(evaluateSourcePath("src/unowned/example.ts").map((item) => item.rule))
      .toEqual(["unknown-source-root"]);
    expect(evaluateSourcePath("src/core/example.ts").map((item) => item.rule))
      .toEqual(["forbidden-catch-all-root"]);
    expect(evaluateSourcePath("src/utils/example.ts").map((item) => item.rule))
      .toEqual(["forbidden-catch-all-root"]);
    expect(evaluateSourcePath("src/project-files/resolver.ts")).toEqual([]);
  });
});
