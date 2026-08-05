export interface CascadeCandidate {
  index: number;
  struck: boolean;
  top: number;
  bottom: number;
  left: number;
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
