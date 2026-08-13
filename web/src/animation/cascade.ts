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

export function groupCascadeColliderFragments(
  fragments: CascadeColliderFragment[],
  lineTolerance = 3,
): CascadeColliderGroup[] {
  const groups: CascadeColliderGroup[] = [];

  for (const fragment of fragments) {
    const group = fragment.blockId
      ? groups.find((candidate) =>
          candidate.blockId === fragment.blockId
          && Math.abs(candidate.top - fragment.top) <= lineTolerance,
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

export function selectNextCascadeRowIndex(
  candidates: CascadeCandidate[],
  currentTop: number,
  canvasHeight: number,
): number {
  const visible = candidates
    .filter((candidate) =>
      !candidate.struck
      && candidate.top < canvasHeight
      && candidate.bottom > 0,
    )
    .sort((a, b) => a.top - b.top || a.left - b.left);

  if (visible.length === 0) return -1;
  const forward = visible.find((candidate) => candidate.top >= currentTop - 8);
  return (forward ?? visible[0]).index;
}
