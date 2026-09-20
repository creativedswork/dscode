import type { ContentBounds } from "./types";

export interface CascadeCandidate {
  index: number;
  struck: boolean;
  top: number;
  bottom: number;
  left: number;
}

export interface CascadeColliderFragment {
  index: number;
  blockId: string | null;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface CascadeColliderGroup {
  indices: number[];
  blockId: string | null;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const LONG_CASCADE_ROW_THRESHOLD = 8;
export const LONG_CASCADE_DIRECT_HITS = 3;

function nearlyEqual(a: number, b: number, tolerance = 0.75): boolean {
  return Math.abs(a - b) <= tolerance;
}

function sameVisualLine(
  a: Pick<ContentBounds, "top" | "bottom">,
  b: Pick<ContentBounds, "top" | "bottom">,
  lineTolerance: number,
): boolean {
  if (Math.abs(a.top - b.top) <= lineTolerance) return true;
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  const minHeight = Math.min(a.bottom - a.top, b.bottom - b.top);
  return minHeight > 0 && overlap / minHeight >= 0.6;
}

export function groupVisualLineRects(
  rects: ContentBounds[],
  lineTolerance = 3,
): ContentBounds[] {
  const ordered = rects
    .filter((rect) => rect.right > rect.left && rect.bottom > rect.top)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const unique = ordered.filter((rect, index) => {
    const previous = ordered[index - 1];
    return !previous
      || !nearlyEqual(rect.top, previous.top)
      || !nearlyEqual(rect.bottom, previous.bottom)
      || !nearlyEqual(rect.left, previous.left)
      || !nearlyEqual(rect.right, previous.right);
  });

  return groupCascadeColliderFragments(
    unique.map((rect, index) => ({
      ...rect,
      index,
      blockId: "visual-line",
    })),
    lineTolerance,
  ).map(({ top, bottom, left, right }) => ({
    top,
    bottom,
    left,
    right,
  }));
}

export function groupCascadeColliderFragments(
  fragments: CascadeColliderFragment[],
  lineTolerance = 3,
): CascadeColliderGroup[] {
  const groups: CascadeColliderGroup[] = [];

  for (const fragment of fragments) {
    const group = fragment.blockId
      ? groups.find((candidate) =>
          candidate.blockId === fragment.blockId
          && sameVisualLine(candidate, fragment, lineTolerance),
        )
      : undefined;

    if (!group) {
      groups.push({
        indices: [fragment.index],
        blockId: fragment.blockId,
        top: fragment.top,
        bottom: fragment.bottom,
        left: fragment.left,
        right: fragment.right,
      });
      continue;
    }

    group.indices.push(fragment.index);
    group.top = Math.min(group.top, fragment.top);
    group.bottom = Math.max(group.bottom, fragment.bottom);
    group.left = Math.min(group.left, fragment.left);
    group.right = Math.max(group.right, fragment.right);
  }

  return groups;
}

export function hasRenderableColliderContent(
  colliderType: string | null,
  textContent: string | null,
): boolean {
  return colliderType === "media-item" || !!textContent?.trim();
}

export function intersectContentBounds(
  bounds: ContentBounds,
  clip: ContentBounds,
): ContentBounds | null {
  const intersection = {
    top: Math.max(bounds.top, clip.top),
    bottom: Math.min(bounds.bottom, clip.bottom),
    left: Math.max(bounds.left, clip.left),
    right: Math.min(bounds.right, clip.right),
  };
  return intersection.bottom > intersection.top
    && intersection.right > intersection.left
    ? intersection
    : null;
}

export function hasSufficientVisibleHeight(
  original: ContentBounds,
  visible: ContentBounds,
  minimumRatio = 0.5,
): boolean {
  const height = original.bottom - original.top;
  return height > 0 && (visible.bottom - visible.top) / height >= minimumRatio;
}

export function shouldAbsorbCascadeOwner(
  totalRows: number,
  directHits: number,
): boolean {
  return totalRows >= LONG_CASCADE_ROW_THRESHOLD
    && directHits >= LONG_CASCADE_DIRECT_HITS;
}

export function selectNextCascadeRowIndex(
  candidates: CascadeCandidate[],
  _currentTop: number,
  _canvasHeight: number,
): number {
  // Full-content selection: return the topmost unstruck row in the entire list.
  // No viewport (canvas height) filtering — rows below the fold must still be
  // reachable so the cascade covers every rendered collider before gather.
  const unstruck = candidates
    .filter((candidate) => !candidate.struck)
    .sort((a, b) => a.top - b.top || a.left - b.left);

  if (unstruck.length === 0) return -1;
  return unstruck[0].index;
}
