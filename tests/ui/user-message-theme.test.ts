import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("WebUI user message theme", () => {
  it("uses neutral bubble colors in light and dark themes", () => {
    const css = readFileSync(join(ROOT, "web/src/index.css"), "utf8");

    expect(css).toContain("--color-user-bubble: #ebe9e5");
    expect(css).toContain("--color-user-bubble-text: #2d2a26");
    expect(css).toContain("--color-user-bubble: #322e2a");
    expect(css).toContain("--color-user-bubble-text: #e8e4dd");
  });

  it("renders the bubble with semantic text and border tokens", () => {
    const css = readFileSync(join(ROOT, "web/src/index.css"), "utf8");
    const rule = css.match(/\.user-msg \.content\s*\{([^}]+)\}/)?.[1];

    expect(rule).toBeDefined();
    expect(rule).toContain("background: var(--color-user-bubble)");
    expect(rule).toContain("color: var(--color-user-bubble-text)");
    expect(rule).toContain("border: 1px solid var(--color-border)");
    expect(rule).not.toContain("var(--color-error)");
    expect(rule).not.toContain("var(--color-accent)");
  });
});
