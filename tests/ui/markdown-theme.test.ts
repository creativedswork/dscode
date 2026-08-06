import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("ChatView Markdown theme", () => {
  it("renders thematic breaks with the theme border color", () => {
    const css = readFileSync(join(ROOT, "web/src/index.css"), "utf8");
    const rule = css.match(/\.text-response hr\s*\{([^}]+)\}/)?.[1];

    expect(rule).toBeDefined();
    expect(rule).toContain("border: 0");
    expect(rule).toContain("border-top: 1px solid var(--color-border)");
    expect(rule).toContain("margin: 12px 0");
    expect(rule).not.toContain("currentColor");
  });
});
