import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  groupCascadeColliderFragments,
  groupVisualLineRects,
  hasSufficientVisibleHeight,
  hasRenderableColliderContent,
  intersectContentBounds,
  selectNextCascadeRowIndex,
  shouldAbsorbCascadeOwner,
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
  it("merges inline Markdown fragments on the same visual line", () => {
    const groups = groupCascadeColliderFragments([
      { index: 0, blockId: "paragraph-1", top: 100, bottom: 120, left: 10, right: 80 },
      { index: 1, blockId: "paragraph-1", top: 102, bottom: 122, left: 82, right: 160 },
      { index: 2, blockId: "paragraph-1", top: 130, bottom: 150, left: 10, right: 100 },
      { index: 3, blockId: "paragraph-2", top: 101, bottom: 121, left: 200, right: 260 },
      { index: 4, blockId: null, top: 100, bottom: 120, left: 300, right: 340 },
    ]);

    expect(groups).toHaveLength(4);
    expect(groups[0]).toMatchObject({
      indices: [0, 1],
      top: 100,
      bottom: 122,
      left: 10,
      right: 160,
    });
    expect(groups[1].indices).toEqual([2]);
    expect(groups[2].indices).toEqual([3]);
    expect(groups[3].indices).toEqual([4]);
  });

  it("groups Range fragments into tight visual lines", () => {
    const lines = groupVisualLineRects([
      { top: 132, bottom: 150, left: 12, right: 140 },
      { top: 105, bottom: 125, left: 80, right: 180 },
      { top: 100, bottom: 120, left: 12, right: 76 },
      { top: 100.2, bottom: 120.2, left: 12.2, right: 76.2 },
    ]);

    expect(lines).toEqual([
      { top: 100, bottom: 125, left: 12, right: 180 },
      { top: 132, bottom: 150, left: 12, right: 140 },
    ]);
  });

  it("filters clipped fragments by visible height", () => {
    const original = { top: 100, bottom: 120, left: 20, right: 180 };
    const mostlyVisible = intersectContentBounds(original, {
      top: 108,
      bottom: 160,
      left: 0,
      right: 200,
    });
    const mostlyHidden = intersectContentBounds(original, {
      top: 115,
      bottom: 160,
      left: 0,
      right: 200,
    });

    expect(mostlyVisible).not.toBeNull();
    expect(hasSufficientVisibleHeight(original, mostlyVisible!)).toBe(true);
    expect(mostlyHidden).not.toBeNull();
    expect(hasSufficientVisibleHeight(original, mostlyHidden!)).toBe(false);
  });

  it("bounds direct impacts before absorbing long content", () => {
    expect(shouldAbsorbCascadeOwner(7, 3)).toBe(false);
    expect(shouldAbsorbCascadeOwner(8, 2)).toBe(false);
    expect(shouldAbsorbCascadeOwner(8, 3)).toBe(true);
  });

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

  it("selects fully off-screen rows when they are the topmost unstruck row", () => {
    const candidates = [
      candidate(0, 1200, { bottom: 1220 }),
    ];

    expect(selectNextCascadeRowIndex(candidates, 0, 500)).toBe(0);
  });

  it("eventually selects every collider across the full content regardless of initial ordering", () => {
    const candidates = [
      candidate(0, 260),
      candidate(1, 80),
      candidate(2, 160),
      candidate(3, 80, { left: 10 }),
      candidate(4, 1200, { bottom: 1220 }),
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

    expect(new Set(selected)).toEqual(new Set([0, 1, 2, 3, 4]));
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

    expect(strikeBody).toContain(
      "destroyByType(element, impactX, impactY, row)",
    );
    expect(strikeBody).not.toContain("row.el.style.transform");
    expect(source).toContain('case "agent-card":');
    expect(source).toContain('case "media-item":');
    expect(source).toContain("hasRenderableColliderContent(colliderType, el.textContent)");
    expect(strikeBody).toContain("row.elements.forEach");
    expect(source).toContain('scrollContainer.style.opacity = "0"');
    expect(source).toContain('el.style.opacity = "0"');
  });

  it("starts at the first visual line and clips wrapped text line by line", () => {
    const source = readFileSync(
      join(ROOT, "web/src/components/TransitionCanvas.tsx"),
      "utf8",
    );

    expect(source).toContain("scrollContainer.scrollTop = 0;");
    expect(source).toContain("const visualLines = getVisualLineBounds(el, scrollContainer!)");
    expect(source).toContain("return groupVisualLineRects(bounds)");
    expect(source).toContain("document.createTreeWalker(el, NodeFilter.SHOW_TEXT)");
    expect(source).toContain('replace(/\\u00a0/g, " ").trim()');
    expect(source).toContain("hasSufficientVisibleHeight(bounds, clipped)");
    expect(source).toContain(
      "el.style.clipPath = `inset(${nextClipTop}px 0 0 0)`",
    );
    expect(source).toContain("initializeContainerCounts(s.rows)");
    expect(source).toContain("pendingRowsByContainer.get(containerEl)");
    expect(source).toContain("destroyedContainers.has(containerEl)");
    expect(source).not.toContain("current!.contains(element)");
    expect(source).not.toContain("CASCADE_STALL_TIMEOUT_MS");
  });

  it("absorbs long owners only after three direct impacts", () => {
    const source = readFileSync(
      join(ROOT, "web/src/components/TransitionCanvas.tsx"),
      "utf8",
    );
    const markdownSource = readFileSync(
      join(ROOT, "web/src/components/Markdown.tsx"),
      "utf8",
    );

    expect(source).toContain('type HopState = "drop" | "squash" | "stretch" | "dwell" | "hopping" | "absorbing"');
    expect(source).toContain("shouldAbsorbCascadeOwner(ownerRows.length, directHits)");
    expect(source).toContain('phase: "attract"');
    expect(source).toContain("finishOwnerAbsorption()");
    expect(source).toContain('particle.phase !== "attract"');
    expect(markdownSource).toContain('data-collider="code-card"');
    expect(markdownSource).toContain('data-collider="table-card"');
  });

  it("aligns cluster drawing with strike targeting via a canvas-space origin offset", () => {
    const source = readFileSync(
      join(ROOT, "web/src/components/TransitionCanvas.tsx"),
      "utf8",
    );

    // Origin offset: canvas origin ↔ scroll-container origin.
    expect(source).toContain("function currentOrigin()");
    expect(source).toContain("originX: scrollRect.left - canvasRect.left");
    expect(source).toContain("originY: scrollRect.top - canvasRect.top");

    // Drawing, impact ring/particles, and per-card impact all apply the offset.
    expect(source).toContain("const vx = c.x + frame.originX");
    expect(source).toContain("const vy = c.y - getScrollTop() + frame.originY");
    expect(source).toContain("const cx = row.contentCenterX + frame.originX");
    expect(source).toContain("const cy = row.contentCenterY - st + frame.originY");
    expect(source).toContain("const impactX = row.contentCenterX + frame.originX");
    expect(source).toContain(
      "const impactY = row.contentCenterY - getScrollTop() + frame.originY",
    );

    // Scroll container resolves from the ref, then from a collider ancestor.
    expect(source).toContain("function resolveScrollContainer()");
    expect(source).toContain(
      "if (scrollContainerRef?.current) return scrollContainerRef.current;",
    );
    expect(source).toContain('container.querySelector<HTMLElement>("[data-collider]")');
    expect(source).toContain('p.classList.contains("overflow-y-auto")');

    // No more degradation to the canvas rect with scrollTop = 0.
    expect(source).toContain("return scrollContainer!.scrollTop;");
    expect(source).toContain("return scrollContainer!.getBoundingClientRect();");
    expect(source).not.toContain("scrollContainer ? scrollContainer.scrollTop : 0");
    expect(source).not.toContain(": canvas!.getBoundingClientRect();");

    // Legacy temporary diagnostic logs are gone.
    expect(source).not.toContain("[dscode]");
  });

  it("marks Markdown declaratively without replacing React-owned text nodes", () => {
    const componentSource = readFileSync(
      join(ROOT, "web/src/components/Markdown.tsx"),
      "utf8",
    );
    const transitionSource = readFileSync(
      join(ROOT, "web/src/components/TransitionCanvas.tsx"),
      "utf8",
    );

    expect(componentSource).toContain('data-collider="text-block"');
    expect(componentSource).toContain("const components = React.useMemo");
    expect(componentSource).not.toContain("annotateVisibleTextLines");
    expect(componentSource).not.toContain("replaceWith");
    expect(transitionSource).toContain('case "text-block":');
  });
});
