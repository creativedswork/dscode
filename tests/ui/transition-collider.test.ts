import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  hasRenderableColliderContent,
  selectNextCascadeRowIndex,
  type CascadeCandidate,
} from "../../web/src/animation/cascade.js";

const ROOT = process.cwd();

function candidate(
  index: number,
  top: number,
  overrides: Partial<CascadeCandidate> = {},
): CascadeCandidate {
  return {
    index,
    struck: false,
    top,
    bottom: top + 20,
    left: index * 100,
    ...overrides,
  };
}

describe("TransitionCanvas collider traversal", () => {
  it("includes media colliders even though images have no textContent", () => {
    expect(hasRenderableColliderContent("media-item", "")).toBe(true);
    expect(hasRenderableColliderContent("media-item", null)).toBe(true);
    expect(hasRenderableColliderContent("text-line", "   ")).toBe(false);
    expect(hasRenderableColliderContent("text-line", "visible")).toBe(true);
  });

  it("selects same-row colliders even when their array index is before the current row", () => {
    const candidates = [
      candidate(0, 100, { left: 20 }),
      candidate(1, 100, { left: 220, struck: true }),
      candidate(2, 180),
    ];

    expect(selectNextCascadeRowIndex(candidates, 104, 500)).toBe(0);
  });

  it("includes partially visible rows and excludes fully off-screen rows", () => {
    const candidates = [
      candidate(0, -10, { bottom: 10 }),
      candidate(1, -30, { bottom: 0 }),
      candidate(2, 500, { bottom: 520 }),
    ];

    expect(selectNextCascadeRowIndex(candidates, 0, 500)).toBe(0);
  });

  it("eventually selects every visible collider regardless of initial ordering", () => {
    const candidates = [
      candidate(0, 260),
      candidate(1, 80),
      candidate(2, 160),
      candidate(3, 80, { left: 10 }),
    ];
    const selected: number[] = [];
    let currentTop = 0;

    while (true) {
      const index = selectNextCascadeRowIndex(candidates, currentTop, 500);
      if (index < 0) break;
      selected.push(index);
      candidates[index].struck = true;
      currentTop = candidates[index].top;
    }

    expect(new Set(selected)).toEqual(new Set([0, 1, 2, 3]));
  });

  it("executes type-specific destruction from strikeRow", () => {
    const source = readFileSync(
      join(ROOT, "web/src/components/TransitionCanvas.tsx"),
      "utf8",
    );
    const strikeBody = source.slice(
      source.indexOf("function strikeRow()"),
      source.indexOf("// ── Phase updates ──"),
    );

    expect(strikeBody).toContain("destroyByType(row.el, impactX, impactY)");
    expect(strikeBody).not.toContain("row.el.style.transform");
    expect(source).toContain('case "agent-card":');
    expect(source).toContain('case "media-item":');
    expect(source).toContain("hasRenderableColliderContent(colliderType, el.textContent)");
    expect(source).toContain('el.style.opacity = "0"');
  });

  it("marks completed Markdown by measured visible lines", () => {
    const source = readFileSync(
      join(ROOT, "web/src/animation/markdownColliders.ts"),
      "utf8",
    );

    expect(source).toContain("annotateVisibleTextLines");
    expect(source).toContain("range.getBoundingClientRect()");
    expect(source).toContain('span.dataset.collider = "text-line"');
    const componentSource = readFileSync(
      join(ROOT, "web/src/components/Markdown.tsx"),
      "utf8",
    );
    expect(componentSource).toContain("annotateVisibleTextLines(rootRef.current)");
    expect(componentSource).not.toContain("wrapCollider");
  });
});
