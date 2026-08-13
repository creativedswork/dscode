import {
  existsSync,
  readFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(path), "utf8");

describe("OpenSpec prototype lifecycle", () => {
  it("defines staging, retention decisions, and durable archive paths", () => {
    const workflow = read(
      ".dscode/skills/prototype-workflow/SKILL.md",
    );

    expect(workflow).toContain("暂存区");
    expect(workflow).toContain("## Prototype Retention");
    expect(workflow).toContain("无法确定时默认");
    expect(workflow).toContain(
      "docs/prototypes/archive/YYYY-MM-DD-<change-name>/",
    );
    expect(read("AGENTS.md")).toContain(
      "`docs/prototypes/` 仅是暂存区",
    );
  });

  it.each([
    ".dscode/skills/openspec-apply-change/SKILL.md",
    ".dscode/commands/opsx/apply.md",
  ])("requires apply retention finalization in %s", (path) => {
    const source = read(path);

    expect(source).toContain("Prototype Retention");
    expect(source).toContain("archive");
    expect(source).toContain("delete");
    expect(source).toContain("pending");
  });

  it.each([
    ".dscode/skills/openspec-archive-change/SKILL.md",
    ".dscode/commands/opsx/archive.md",
  ])("requires archive relocation and stale-reference checks in %s", (path) => {
    const source = read(path);

    expect(source).toContain(
      "docs/prototypes/archive/YYYY-MM-DD-<change-name>/",
    );
    expect(source).toContain("staging");
    expect(source).toMatch(/references|引用/);
  });

  it("initializes retention as pending in the prototype artifact schema", () => {
    const template = read(
      "openspec/schemas/spec-driven-plus/templates/prototype.md",
    );
    const schema = read(
      "openspec/schemas/spec-driven-plus/schema.yaml",
    );

    expect(template).toContain("## Prototype Retention");
    expect(template).toContain("`pending`");
    expect(schema).toContain("each decision to `pending`");
  });

  it("keeps durable historical prototypes archived and removes disposable ones", () => {
    const archived = [
      "docs/prototypes/archive/2026-07-14-fix-explore-prototype-html/mcp-toolcard-execution-view-prototype.html",
      "docs/prototypes/archive/2026-07-15-fix-file-upload-cache/settings-cache-management.html",
      "docs/prototypes/archive/2026-08-04-include-subagents-in-session-dashboard/include-subagents-in-session-dashboard-overview.html",
      "docs/prototypes/archive/2026-08-04-show-subagents-in-conversation/show-subagents-in-conversation.html",
      "docs/prototypes/archive/2026-08-05-adapt-eval-to-subagents/adapt-eval-to-subagents.html",
      "docs/prototypes/archive/2026-08-05-show-eval-dashboard-in-webui/show-eval-dashboard-in-webui-embedded-report.html",
      "docs/prototypes/archive/2026-08-07-tui-execution-hierarchy-redesign/tui-execution-hierarchy-redesign.html",
    ];
    const deleted = [
      "docs/prototypes/builtin-tool-result-rendering-fix-v5.html",
      "docs/prototypes/markdown-line-split-fix.html",
      "docs/prototypes/web-ui-redesign-editorial-workshop-v3.html",
    ];

    for (const path of archived) {
      expect(existsSync(resolve(path)), path).toBe(true);
    }
    for (const path of deleted) {
      expect(existsSync(resolve(path)), path).toBe(false);
    }
  });

  it("keeps archived prototype Markdown links resolvable", () => {
    const manifests = [
      "openspec/changes/archive/2026-08-04-include-subagents-in-session-dashboard/prototype.md",
      "openspec/changes/archive/2026-08-04-show-subagents-in-conversation/prototype.md",
      "openspec/changes/archive/2026-08-07-tui-execution-hierarchy-redesign/prototype.md",
    ];

    for (const manifest of manifests) {
      const absoluteManifest = resolve(manifest);
      const links = [
        ...read(manifest).matchAll(/\]\(([^)]+\.html)\)/g),
      ].map((match) => match[1]);
      expect(links.length, manifest).toBeGreaterThan(0);
      for (const link of links) {
        expect(
          existsSync(resolve(dirname(absoluteManifest), link)),
          `${manifest} -> ${link}`,
        ).toBe(true);
      }
    }
  });
});
