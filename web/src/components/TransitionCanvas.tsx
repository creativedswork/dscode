import { useEffect, useRef } from "react";
import type { Particle, ImpactRing, Shard, TimestampEntry, ContentBounds } from "../animation/types";
import {
  groupCascadeColliderFragments,
  groupVisualLineRects,
  hasSufficientVisibleHeight,
  hasRenderableColliderContent,
  intersectContentBounds,
  selectNextCascadeRowIndex,
  shouldAbsorbCascadeOwner,
} from "../animation/cascade";

interface TransitionCanvasProps {
  artifactReady: boolean;
  onComplete: () => void;
  scrollContainerRef?: React.RefObject<HTMLElement>;
}

type Phase = "cascade" | "gather" | "formed";

interface CascadeRow {
  el: HTMLElement;
  elements: HTMLElement[];
  top: number;
  left: number;
  width: number;
  height: number;
  landingX: number;
  landingY: number;
  struck: boolean;
  contentTop: number;
  contentBottom: number;
  contentLeft: number;
  contentRight: number;
  contentCenterX: number;
  contentCenterY: number;
  owner: HTMLElement;
  containers: HTMLElement[];
}

type HopState = "drop" | "squash" | "stretch" | "dwell" | "hopping" | "absorbing";

interface ClusterState {
  x: number;
  y: number;
  hopState: HopState;
  hopTimer: number;
  rowIndex: number;
  hopStartX: number;
  hopStartY: number;
  hopEndX: number;
  hopEndY: number;
  hopDuration: number;
  hopProgress: number;
  nextRowIndex: number;
}

interface AnimationState {
  phase: Phase;
  phaseTime: number;
  colors: ThemeColors;
  particles: Particle[];
  impactRings: ImpactRing[];
  shards: Shard[];
  shake: number;
  formedTime: number;
  targetPoints: { x: number; y: number; letter: string }[];
  particlesAssigned: number;
  gatherStarted: boolean;
  W: number;
  H: number;
  // ── Hop-step cluster ──
  cluster: ClusterState;
  rows: CascadeRow[];
  scaleX: number;
  scaleY: number;
  breathPhase: number;
  // ── Color map ──
  letterColorMap: Record<string, string>;
  // ── Timestamp dissolution ──
  timestamps: TimestampEntry[];
  dissolvedTimestampEls: Set<HTMLElement>;
}

interface ThemeColors {
  accent: string;
  text: string;
  textMuted: string;
}

const MAX_PARTICLES = 2500;
const DPR_CAP = 2;

// ── Hop-step constants ──
const SQUASH_MS = 80;
const STRETCH_MS = 60;
const DWELL_MS = 300;
const ABSORB_MS = 480;
const CLUSTER_SIZE = 22;
const DROP_SPEED = 4;
const NESTED_CLIP_VALUES = new Set(["auto", "scroll", "hidden", "clip"]);
const CASCADE_OWNER_SELECTOR = [
  '[data-collider="message-card"]',
  '[data-collider="tool-card"]',
  '[data-collider="agent-card"]',
  '[data-collider="exec-card"]',
  '[data-collider="thinking-block"]',
  '[data-collider="code-card"]',
  '[data-collider="table-card"]',
].join(",");

// ── Cluster offsets (1×6 single row) ──
const CLUSTER_OFFSETS = [
  { char: "d", ox: -40, oy: 0 },
  { char: "s", ox: -24, oy: 0 },
  { char: "c", ox: -8,  oy: 0 },
  { char: "o", ox: +8,  oy: 0 },
  { char: "d", ox: +24, oy: 0 },
  { char: "e", ox: +40, oy: 0 },
];

// ── Module-level helpers ──

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function clipToNestedAncestors(
  bounds: ContentBounds,
  el: HTMLElement,
  scrollContainer: HTMLElement,
): ContentBounds | null {
  let visible = bounds;
  let parent = el.parentElement;
  while (parent && parent !== scrollContainer) {
    const style = getComputedStyle(parent);
    const clips = NESTED_CLIP_VALUES.has(style.overflow)
      || NESTED_CLIP_VALUES.has(style.overflowX)
      || NESTED_CLIP_VALUES.has(style.overflowY);
    if (clips) {
      const rect = parent.getBoundingClientRect();
      const clipped = intersectContentBounds(visible, {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      });
      if (!clipped || !hasSufficientVisibleHeight(bounds, clipped)) return null;
      visible = clipped;
    }
    parent = parent.parentElement;
  }
  return visible;
}

function getVisualLineBounds(
  el: HTMLElement,
  scrollContainer: HTMLElement,
): ContentBounds[] {
  try {
    const bounds: ContentBounds[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.textContent?.replace(/\u00a0/g, " ").trim()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = range.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          const rect = rects[i];
          if (rect.width < 1 || rect.height < 1) continue;
          const clipped = clipToNestedAncestors({
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
          }, el, scrollContainer);
          if (clipped) bounds.push(clipped);
        }
      }
      node = walker.nextNode();
    }
    return groupVisualLineRects(bounds);
  } catch {
    return [];
  }
}

function isTextLikeCollider(type: string | null): boolean {
  return type === "text-line"
    || type === "text-block"
    || type === "code-line"
    || type === "tool-result-line"
    || type === "tool-header"
    || type === "phase-label"
    || type === "table-cell";
}

export function TransitionCanvas({ artifactReady, onComplete, scrollContainerRef }: TransitionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<AnimationState | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const artifactReadyRef = useRef(artifactReady);
  artifactReadyRef.current = artifactReady;
  const onCompleteCalledRef = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onCompleteRef.current();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "none";

    // ── Read CSS custom properties ──
    const styles = getComputedStyle(document.documentElement);
    const accentHex = styles.getPropertyValue("--color-accent").trim() || "#ca8a04";
    const colors: ThemeColors = {
      accent: accentHex,
      text: styles.getPropertyValue("--color-text").trim() || "#2d2a26",
      textMuted: styles.getPropertyValue("--color-text-muted").trim() || "#8a8580",
    };
    const accentHue = (() => {
      const [r, g, b] = hexToRgb(colors.accent);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      if (d === 0) return 38;
      if (max === r) return ((g - b) / d + (g < b ? 6 : 0)) * 60;
      if (max === g) return ((b - r) / d + 2) * 60;
      return ((r - g) / d + 4) * 60;
    })();
    const warmAccent2 = `hsl(${(accentHue + 20) % 360}, 45%, 52%)`;
    const letterColorMap: Record<string, string> = {
      d: colors.accent,
      s: warmAccent2,
      c: warmAccent2,
      o: colors.textMuted,
      e: colors.text,
    };
    // ── Size canvas (deferred to first rAF to avoid 0×0 race) ──
    let W = 0, H = 0;
    const container = canvas.parentElement!;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

    // ── Resolve the chat scroll container robustly ──
    // Priority 1: the chat scroll container ref. Priority 2: the nearest
    // scrollable ancestor of any [data-collider] element. We deliberately do
    // NOT fall back to the canvas rect with scrollTop = 0 — that is the bug
    // this change fixes.
    function resolveScrollContainer(): HTMLElement | null {
      if (scrollContainerRef?.current) return scrollContainerRef.current;
      const collider = container.querySelector<HTMLElement>("[data-collider]");
      let p: HTMLElement | null = collider ? collider.parentElement : null;
      while (p && p !== document.body) {
        const overflowY = getComputedStyle(p).overflowY;
        const scrollable = overflowY === "auto" || overflowY === "scroll";
        const autoClass = p.classList.contains("overflow-y-auto");
        if (scrollable || autoClass) return p;
        p = p.parentElement;
      }
      return null;
    }
    const scrollContainer = resolveScrollContainer();
    let prevScrollTop = 0;
    let prevOverflow = "";
    let prevOpacity = "";
    let prevTransition = "";
    if (scrollContainer) {
      prevScrollTop = scrollContainer.scrollTop;
      prevOverflow = scrollContainer.style.overflow;
      prevOpacity = scrollContainer.style.opacity;
      prevTransition = scrollContainer.style.transition;
      scrollContainer.style.overflow = "hidden";
      scrollContainer.scrollTop = 0;
    }

    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d")!;

    function renderTargets(): { x: number; y: number; letter: string }[] {
      const fontSize = Math.min(320, W * 0.18, H * 0.5);
      offscreen.width = W * dpr;
      offscreen.height = H * dpr;
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      offCtx.clearRect(0, 0, W, H);
      offCtx.font = `700 ${fontSize}px "Geist", sans-serif`;
      offCtx.textAlign = "center";
      offCtx.textBaseline = "middle";
      offCtx.fillStyle = "#ffffff";
      offCtx.fillText("DSCode", W / 2, H / 2);

      // Compute per-letter X boundaries for assigning colors
      const fullText = "DSCode";
      const fullWidth = offCtx.measureText(fullText).width;
      const startX = W / 2 - fullWidth / 2;
      const letterBounds: { letter: string; left: number; right: number }[] = [];
      let cursor = startX;
      for (let li = 0; li < fullText.length; li++) {
        const w = offCtx.measureText(fullText[li]).width;
        letterBounds.push({ letter: fullText[li], left: cursor, right: cursor + w });
        cursor += w;
      }

      const imageData = offCtx.getImageData(0, 0, Math.floor(W * dpr), Math.floor(H * dpr));
      const points: { x: number; y: number; letter: string }[] = [];
      const step = 6;
      for (let py = 0; py < H; py += step) {
        for (let px = 0; px < W; px += step) {
          const idx = (Math.floor(py * dpr) * Math.floor(W * dpr) + Math.floor(px * dpr)) * 4;
          if (idx + 3 < imageData.data.length && imageData.data[idx + 3] > 128) {
            // Determine which letter this pixel belongs to by X coordinate
            const b = letterBounds.find((lb) => px >= lb.left && px < lb.right);
            const letter = b ? b.letter : fullText[Math.min(Math.floor((px - startX) / (fullWidth / fullText.length)), fullText.length - 1)];
            points.push({ x: px, y: py, letter });
          }
        }
      }
      // Shuffle
      for (let i = points.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [points[i], points[j]] = [points[j], points[i]];
      }
      return points.slice(0, MAX_PARTICLES);
    }

    const ownerIds = new WeakMap<HTMLElement, number>();
    let nextOwnerId = 0;

    function cascadeOwner(el: HTMLElement): HTMLElement {
      return el.closest<HTMLElement>(CASCADE_OWNER_SELECTOR) ?? el;
    }

    function ownerGroupId(owner: HTMLElement): string {
      let id = ownerIds.get(owner);
      if (id === undefined) {
        id = nextOwnerId++;
        ownerIds.set(owner, id);
      }
      return `visual-line:${id}`;
    }

    function colliderParentChain(elements: HTMLElement[]): HTMLElement[] {
      const parents = new Set<HTMLElement>();
      elements.forEach((element) => {
        let parent = element.parentElement;
        while (parent && parent !== container) {
          if (parent.hasAttribute("data-collider")) parents.add(parent);
          parent = parent.parentElement;
        }
      });
      return [...parents];
    }

    // ── Row list builder ──
    function buildRowList(): CascadeRow[] {
      const all = container.querySelectorAll<HTMLElement>("[data-collider]");
      const scrollRect = currentScrollRect();
      const scrollTop = getScrollTop();
      const rows: CascadeRow[] = [];
      const fragments: Array<{
        el: HTMLElement;
        blockId: string | null;
        top: number;
        bottom: number;
        left: number;
        right: number;
        contentTop: number;
        contentBottom: number;
        contentLeft: number;
        contentRight: number;
        owner: HTMLElement;
      }> = [];

      all.forEach((el) => {
        if (el.querySelector("[data-collider]")) return;

        const colliderType = el.getAttribute("data-collider");
        // Media colliders are renderable without textContent.
        if (!hasRenderableColliderContent(colliderType, el.textContent)) return;

        const rect = el.getBoundingClientRect();
        const textLike = isTextLikeCollider(colliderType);
        const owner = cascadeOwner(el);
        const blockId = textLike ? ownerGroupId(owner) : null;

        // Range rects represent actual rendered lines. Keeping them separate
        // lets a wrapped paragraph disappear one struck line at a time.
        if (textLike) {
          const visualLines = getVisualLineBounds(el, scrollContainer!);
          if (visualLines.length > 0) {
            visualLines.forEach((line) => {
              const top = line.top - scrollRect.top + scrollTop;
              const bottom = line.bottom - scrollRect.top + scrollTop;
              const left = line.left - scrollRect.left;
              const right = line.right - scrollRect.left;
              fragments.push({
                el,
                blockId,
                top,
                bottom,
                left,
                right,
                contentTop: top,
                contentBottom: bottom,
                contentLeft: left,
                contentRight: right,
                owner,
              });
            });
          }
          return;
        }

        // Non-text colliders use their visible element box. Text-like
        // colliders with no non-empty visible Text node were returned above.
        const visibleRect = clipToNestedAncestors({
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        }, el, scrollContainer!);
        if (!visibleRect) return;
        const top = visibleRect.top - scrollRect.top + scrollTop;
        const bottom = visibleRect.bottom - scrollRect.top + scrollTop;
        const left = visibleRect.left - scrollRect.left;
        const right = visibleRect.right - scrollRect.left;
        fragments.push({
          el,
          blockId,
          top,
          bottom,
          left,
          right,
          contentTop: top,
          contentBottom: bottom,
          contentLeft: left,
          contentRight: right,
          owner,
        });
      });

      const groups = groupCascadeColliderFragments(
        fragments.map((fragment, index) => ({
          index,
          blockId: fragment.blockId,
          top: fragment.top,
          bottom: fragment.bottom,
          left: fragment.left,
          right: fragment.right,
        })),
      );

      groups.forEach((group) => {
        const elements = [...new Set(
          group.indices.map((index) => fragments[index].el),
        )];
        const width = group.right - group.left;
        const height = group.bottom - group.top;

        // Land on the tight text-content center of the row.
        const groupFragments = group.indices.map((index) => fragments[index]);
        const contentLeft = Math.min(...groupFragments.map((f) => f.contentLeft));
        const contentRight = Math.max(...groupFragments.map((f) => f.contentRight));
        const contentTop = Math.min(...groupFragments.map((f) => f.contentTop));
        const contentBottom = Math.max(...groupFragments.map((f) => f.contentBottom));
        const contentCenterX = (contentLeft + contentRight) / 2;
        const contentCenterY = (contentTop + contentBottom) / 2;

        rows.push({
          el: elements[0],
          elements,
          top: group.top,
          left: group.left,
          width,
          height,
          landingX: contentCenterX,
          landingY: contentCenterY,
          struck: false,
          contentTop,
          contentBottom,
          contentLeft,
          contentRight,
          contentCenterX,
          contentCenterY,
          owner: groupFragments[0].owner,
          containers: colliderParentChain(elements),
        });
      });

      // Sort by content-space Y for correct top-to-bottom cascade.
      rows.sort((a, b) => a.top - b.top || a.left - b.left);

      return rows;
    }

    // ── Timestamp list builder ──
    function buildTimestampList(): TimestampEntry[] {
      const all = container.querySelectorAll<HTMLElement>(".meta");
      const scrollRect = currentScrollRect();
      const scrollTop = getScrollTop();
      const entries: TimestampEntry[] = [];

      all.forEach((el) => {
        // Skip timestamps nested inside [data-collider] elements (e.g. inside cards)
        if (el.closest("[data-collider]")) return;
        if (!el.textContent?.trim()) return;

        const rect = el.getBoundingClientRect();
        const top = rect.top - scrollRect.top + scrollTop;

        entries.push({
          el,
          top,
          left: rect.left - scrollRect.left,
          width: rect.width,
          height: rect.height,
          dissolved: false,
        });
      });

      return entries;
    }


    // ── Initialize state ──
    const s: AnimationState = {
      phase: "cascade",
      phaseTime: 0,
      colors,
      particles: [],
      impactRings: [],
      shards: [],
      shake: 0,
      formedTime: 0,
      targetPoints: [],
      particlesAssigned: 0,
      gatherStarted: false,
      W,
      H,
      cluster: {
        x: 0,
        y: 0,
        hopState: "drop",
        hopTimer: 0,
        rowIndex: -1,
        hopStartX: 0,
        hopStartY: 0,
        hopEndX: 0,
        hopEndY: 0,
        hopDuration: 0,
        hopProgress: 0,
        nextRowIndex: -1,
      },
      rows: [],
      scaleX: 1,
      scaleY: 1,
      breathPhase: 0,
      letterColorMap,
      timestamps: [],
      dissolvedTimestampEls: new Set(),
    };
    stateRef.current = s;

    // ── Scroll-coordinate helpers ──
    // These run only after the scroll container has resolved (see
    // resolveScrollContainer + firstFrame early bail-out), so the non-null
    // assertion is safe. They must never fall back to the canvas rect with a
    // scrollTop of 0 — that was the coordinate-mismatch bug.
    function getScrollTop(): number {
      return scrollContainer!.scrollTop;
    }

    function currentScrollRect(): DOMRect {
      return scrollContainer!.getBoundingClientRect();
    }

    // Canvas origin ↔ scroll-container origin offset. All canvas-space
    // coordinates (drawing + impact) are offset by this amount so that
    // "where the cluster is drawn" and "where the row is struck" align even
    // when the canvas covers a larger area than the scroll container (e.g. a
    // top bar, side bar, or bottom input region).
    function currentOrigin(): { originX: number; originY: number } {
      const scrollRect = currentScrollRect();
      const canvasRect = canvas!.getBoundingClientRect();
      return {
        originX: scrollRect.left - canvasRect.left,
        originY: scrollRect.top - canvasRect.top,
      };
    }

    // Keep the cluster near a fixed viewport fraction while it descends the
    // full content. `overflow: hidden` locks user scrolling; programmatic
    // scrollTop updates are unaffected.
    function autoScroll(): void {
      if (!scrollContainer) return;
      const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      const target = clamp(s.cluster.y - scrollContainer.clientHeight * 0.62, 0, maxScroll);
      scrollContainer.scrollTop += (target - scrollContainer.scrollTop) * 0.22;
    }

    // ── ESC key handler ──
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && s.phase === "cascade" && !s.gatherStarted) {
        startGather();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    // ── Spawn & particle helpers ──

    function spawnParticles(el: HTMLElement): void {
      const rect = el.getBoundingClientRect();
      const canvasRect = canvas!.getBoundingClientRect();
      const rx = rect.left - canvasRect.left;
      const ry = rect.top - canvasRect.top;
      const rw = rect.width;
      const rh = rect.height;
      const isCard = ["tool-card", "message-card", "agent-card"].includes(
        el.getAttribute("data-collider") ?? "",
      );
      const count = isCard ? randInt(30, 50) : randInt(20, 40);
      for (let i = 0; i < count; i++) {
        const px = rx + rand(0, rw);
        const py = ry + rand(0, rh);
        const angle = Math.atan2(py - (ry + rh / 2), px - (rx + rw / 2));
        const speed = rand(2, 8);
        const warmColors = [colors.accent, warmAccent2, colors.text];
        const particleColor = warmColors[randInt(0, warmColors.length - 1)];
        s.particles.push({
          x: px,
          y: py,
          vx: Math.cos(angle) * speed + rand(-3, 3),
          vy: Math.sin(angle) * speed - rand(1, 5),
          size: rand(1.5, 4),
          color: particleColor,
          phase: "fall",
          life: randInt(1500, 3000),
        });
      }
    }

    // Radial burst + accent ring + screen shake at the row's text center.
    function spawnImpact(row: CascadeRow): void {
      const st = getScrollTop();
      const frame = currentOrigin();
      const cx = row.contentCenterX + frame.originX;
      const cy = row.contentCenterY - st + frame.originY;
      const w = Math.max(1, row.contentRight - row.contentLeft);
      const h = Math.max(1, row.contentBottom - row.contentTop);

      const count = Math.max(34, Math.min(80, Math.round(w / 6)));
      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(2, 9);
        s.particles.push({
          x: cx + rand(-w / 2, w / 2),
          y: cy + rand(-h / 2, h / 2),
          vx: Math.cos(angle) * speed + rand(-2, 2),
          vy: Math.sin(angle) * speed - rand(1, 4),
          size: rand(1.5, 4.5),
          color: Math.random() < 0.55 ? colors.accent : warmAccent2,
          phase: "fall",
          life: randInt(500, 1300),
        });
      }
      s.impactRings.push({ x: cx, y: cy, r: 4, life: 1 });
      s.shake = Math.min(10, s.shake + 6);
    }

    // ── Per-type destruction effects ──

    const textClipTops = new Map<HTMLElement, number>();
    const pendingRowsByContainer = new Map<HTMLElement, number>();
    const destroyedContainers = new Set<HTMLElement>();
    const deferredContainerCleanup = new Set<HTMLElement>();
    const directHitsByOwner = new WeakMap<HTMLElement, number>();
    let absorbingOwner: HTMLElement | null = null;
    let absorptionDeferredContainers: HTMLElement[] = [];

    function destroyTextLine(el: HTMLElement, row: CascadeRow): void {
      const rect = el.getBoundingClientRect();
      const scrollRect = currentScrollRect();
      const elementTop = rect.top - scrollRect.top + getScrollTop();
      const previousClipTop = textClipTops.get(el) ?? 0;
      const nextClipTop = Math.max(
        previousClipTop,
        clamp(Math.ceil(row.contentBottom - elementTop + 1), 0, rect.height),
      );
      const elementRows = s.rows.filter((candidate) =>
        candidate.elements.includes(el)
      );
      const allRowsStruck = elementRows.every((candidate) => candidate.struck);

      if (!textClipTops.has(el)) {
        el.style.clipPath = "inset(0px 0 0 0)";
        el.getBoundingClientRect();
      }
      textClipTops.set(el, nextClipTop);
      el.style.transition = allRowsStruck
        ? "clip-path 140ms ease-out, opacity 140ms ease-out"
        : "clip-path 140ms ease-out";
      el.style.clipPath = `inset(${nextClipTop}px 0 0 0)`;
      if (allRowsStruck) el.style.opacity = "0";
    }

    function destroyToolCard(el: HTMLElement, impactX: number, impactY: number): void {
      const canvasRect = canvas!.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const rx = rect.left - canvasRect.left;
      const ry = rect.top - canvasRect.top;

      el.style.clipPath = `circle(100% at ${impactX - rx}px ${impactY - ry}px)`;
      el.style.transition = "clip-path 350ms ease-in, opacity 200ms ease-out 250ms";
      requestAnimationFrame(() => {
        el.style.clipPath = `circle(0% at ${impactX - rx}px ${impactY - ry}px)`;
        el.style.opacity = "0";
      });

      const burstCount = randInt(40, 70);
      for (let i = 0; i < burstCount; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(3, 10);
        s.particles.push({
          x: impactX,
          y: impactY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: rand(1.5, 4),
          color: rand(0, 1) > 0.5 ? colors.accent : warmAccent2,
          phase: "fall",
          life: randInt(2000, 3500),
        });
      }
    }

    function destroyMessageCard(el: HTMLElement): void {
      // Parent cards only reach this function after all nested colliders are
      // struck, so the remaining card chrome and unwrapped text can now leave.
      el.style.transition = "none";
      el.style.backgroundColor = "rgba(255,255,255,0.5)";
      requestAnimationFrame(() => {
        el.style.transition =
          "background-color 80ms ease-out, opacity 180ms ease-out 60ms";
        el.style.backgroundColor = "transparent";
        el.style.opacity = "0";
      });

      const canvasRect = canvas!.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const rx = rect.left - canvasRect.left;
      const ry = rect.top - canvasRect.top;
      const rw = rect.width;
      const rh = rect.height;
      const shardCount = randInt(4, 6);
      for (let i = 0; i < shardCount; i++) {
        const cx = rx + rand(rw * 0.2, rw * 0.8);
        const cy = ry + rand(rh * 0.2, rh * 0.8);
        const pts = [];
        const ptCount = randInt(3, 5);
        for (let j = 0; j < ptCount; j++) {
          const angle = (j / ptCount) * Math.PI * 2 + rand(-0.3, 0.3);
          const r = rand(8, 25);
          pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
        }
        s.shards.push({
          x: cx,
          y: cy,
          vx: rand(-3, 3),
          vy: rand(-4, 1),
          rotation: rand(0, Math.PI * 2),
          rotationSpeed: rand(-0.05, 0.05),
          size: rand(1, 3),
          color: colors.textMuted,
          life: 500,
          points: pts,
        });
      }
    }

    function spawnAttractionDust(
      rows: CascadeRow[],
      impactX: number,
      impactY: number,
    ): void {
      const frame = currentOrigin();
      const scrollTop = getScrollTop();
      const visibleRows = rows.filter((row) => {
        const y = row.contentCenterY - scrollTop + frame.originY;
        return y > -40 && y < H + 40;
      });
      const sources = visibleRows.length > 0 ? visibleRows : rows.slice(0, 8);
      const count = Math.min(
        72,
        MAX_PARTICLES - s.particles.length,
        Math.max(24, sources.length * 3),
      );

      for (let i = 0; i < count; i++) {
        const row = sources[i % sources.length];
        const x = rand(
          row.contentLeft + frame.originX,
          row.contentRight + frame.originX,
        );
        const y = row.contentCenterY - scrollTop + frame.originY + rand(-4, 4);
        s.particles.push({
          x,
          y,
          vx: rand(-0.8, 0.8),
          vy: rand(-0.8, 0.8),
          size: rand(1.2, 2.8),
          color: Math.random() < 0.6 ? colors.accent : colors.textMuted,
          phase: "attract",
          tx: impactX,
          ty: impactY,
          orbit: i % 2 === 0 ? 1 : -1,
          life: ABSORB_MS,
        });
      }
    }

    function absorbOwner(
      owner: HTMLElement,
      rows: CascadeRow[],
      impactX: number,
      impactY: number,
    ): void {
      const canvasRect = canvas!.getBoundingClientRect();
      const rect = owner.getBoundingClientRect();
      const localX = clamp(
        impactX - (rect.left - canvasRect.left),
        0,
        rect.width,
      );
      const localY = clamp(
        impactY - (rect.top - canvasRect.top),
        0,
        rect.height,
      );

      owner.style.transformOrigin = `${localX}px ${localY}px`;
      owner.style.willChange = "transform, opacity, clip-path";
      owner.style.transition = [
        `transform ${ABSORB_MS}ms cubic-bezier(0.5, 0, 0.75, 0.4)`,
        "opacity 360ms ease-in 80ms",
        `clip-path ${ABSORB_MS}ms cubic-bezier(0.5, 0, 0.75, 0.4)`,
      ].join(", ");
      owner.style.clipPath = `circle(160% at ${localX}px ${localY}px)`;
      owner.getBoundingClientRect();
      requestAnimationFrame(() => {
        owner.style.transform = `scale(0.06) rotate(${rand(-5, 5)}deg)`;
        owner.style.clipPath = `circle(0% at ${localX}px ${localY}px)`;
        owner.style.opacity = "0";
      });
      spawnAttractionDust(rows, impactX, impactY);
    }

    function destroyByType(
      el: HTMLElement,
      impactX: number,
      impactY: number,
      row?: CascadeRow,
    ): void {
      const type = el.getAttribute("data-collider");
      switch (type) {
        case "text-line":
        case "text-block":
        case "code-line":
        case "tool-header":
        case "tool-result-line":
        case "phase-label":
        case "table-cell":
          if (row) {
            destroyTextLine(el, row);
          } else {
            el.style.transition = "opacity 180ms ease-out";
            el.style.opacity = "0";
          }
          break;
        case "tool-card":
        case "code-card":
        case "table-card":
          destroyToolCard(el, impactX, impactY);
          break;
        case "message-card":
          destroyMessageCard(el);
          break;
        case "agent-card":
          destroyToolCard(el, impactX, impactY);
          break;
        case "exec-card":
          destroyToolCard(el, impactX, impactY);
          break;
        case "media-item":
          destroyToolCard(el, impactX, impactY);
          break;
        case "thinking-block":
          destroyThinkingBlock(el);
          break;
        default:
          spawnParticles(el);
          el.style.transition = "opacity 220ms ease-out";
          el.style.opacity = "0";
          break;
      }
    }

    function initializeContainerCounts(rows: CascadeRow[]): void {
      pendingRowsByContainer.clear();
      rows.forEach((row) => {
        row.containers.forEach((containerEl) => {
          pendingRowsByContainer.set(
            containerEl,
            (pendingRowsByContainer.get(containerEl) ?? 0) + 1,
          );
        });
      });
    }

    function destroyContainer(containerEl: HTMLElement): void {
      if (destroyedContainers.has(containerEl)) return;
      destroyedContainers.add(containerEl);
      const rect = containerEl.getBoundingClientRect();
      const canvasRect = canvas!.getBoundingClientRect();
      destroyByType(
        containerEl,
        rect.left - canvasRect.left + rect.width / 2,
        rect.top - canvasRect.top + rect.height / 2,
      );
    }

    function completeRow(row: CascadeRow): boolean {
      if (row.struck) return false;
      row.struck = true;
      row.containers.forEach((containerEl) => {
        const remaining = Math.max(
          0,
          (pendingRowsByContainer.get(containerEl) ?? 1) - 1,
        );
        pendingRowsByContainer.set(containerEl, remaining);
        if (remaining === 0 && !deferredContainerCleanup.has(containerEl)) {
          destroyContainer(containerEl);
        }
      });
      return true;
    }

    function beginOwnerAbsorption(
      row: CascadeRow,
      impactX: number,
      impactY: number,
    ): boolean {
      const ownerRows = s.rows.filter((candidate) => candidate.owner === row.owner);
      const directHits = (directHitsByOwner.get(row.owner) ?? 0) + 1;
      directHitsByOwner.set(row.owner, directHits);
      const remainingRows = ownerRows.filter((candidate) => !candidate.struck);
      if (
        remainingRows.length === 0
        || !shouldAbsorbCascadeOwner(ownerRows.length, directHits)
      ) {
        return false;
      }

      absorptionDeferredContainers = [
        ...(row.owner.hasAttribute("data-collider") ? [row.owner] : []),
        ...colliderParentChain([row.owner]),
      ];
      absorptionDeferredContainers.forEach((containerEl) => {
        deferredContainerCleanup.add(containerEl);
      });
      remainingRows.forEach((candidate) => completeRow(candidate));

      absorbingOwner = row.owner;
      absorbOwner(row.owner, remainingRows, impactX, impactY);
      destroyedContainers.add(row.owner);
      s.cluster.hopState = "absorbing";
      s.cluster.hopTimer = ABSORB_MS;
      return true;
    }

    function finishOwnerAbsorption(): void {
      const owner = absorbingOwner;
      absorptionDeferredContainers.forEach((containerEl) => {
        deferredContainerCleanup.delete(containerEl);
        if (
          containerEl !== owner
          && (pendingRowsByContainer.get(containerEl) ?? 0) === 0
        ) {
          destroyContainer(containerEl);
        }
      });
      absorbingOwner = null;
      absorptionDeferredContainers = [];
    }

    function startGather(): void {
      if (s.gatherStarted) return;
      s.gatherStarted = true;
      s.particles = s.particles.filter((particle) => particle.phase !== "attract");
      if (scrollContainer) {
        scrollContainer.style.transition = "opacity 120ms ease-out";
        scrollContainer.style.opacity = "0";
      } else {
        s.rows.forEach((row) => {
          row.elements.forEach((element) => {
            element.style.opacity = "0";
          });
        });
      }
      s.phase = "gather";
      s.phaseTime = 0;
      s.targetPoints = renderTargets();
      s.particlesAssigned = 0;
      const cap = Math.min(s.particles.length, s.targetPoints.length);
      for (let i = 0; i < cap; i++) {
        s.particles[i].tx = s.targetPoints[i].x;
        s.particles[i].ty = s.targetPoints[i].y;
        s.particles[i].gatherDelay = rand(20, 80);
        s.particlesAssigned++;
      }
    }

    // ── Hop helpers ──

    function launchHop(): void {
      const c = s.cluster;
      const currentRow = s.rows[c.rowIndex];

      const candidates = s.rows.map((candidate, index) => ({
        index,
        struck: candidate.struck,
        top: candidate.top,
        bottom: candidate.top + candidate.height,
        left: candidate.left,
      }));
      const nextIndex = selectNextCascadeRowIndex(
        candidates,
        currentRow.top,
        H,
      );
      if (nextIndex < 0) {
        startGather();
        return;
      }

      const nextRow = s.rows[nextIndex];
      c.nextRowIndex = nextIndex;

      c.hopStartX = currentRow.landingX;
      c.hopStartY = currentRow.landingY;
      c.hopEndX = nextRow.landingX;
      c.hopEndY = nextRow.landingY;

      const gap = Math.abs(c.hopEndY - c.hopStartY);
      c.hopDuration = Math.max(350, Math.min(800, Math.sqrt(gap) * 25));
      c.hopState = "hopping";
    }

    // ── Timestamp dissolution ──

    const PROXIMITY_THRESHOLD = 60;

    function dissolveTimestamp(entry: TimestampEntry): void {
      if (entry.dissolved) return;
      entry.dissolved = true;
      s.dissolvedTimestampEls.add(entry.el);

      const canvasRect = canvas!.getBoundingClientRect();
      const rect = entry.el.getBoundingClientRect();
      const rx = rect.left - canvasRect.left;
      const ry = rect.top - canvasRect.top;
      const text = entry.el.textContent || "";
      const chars = [...text];

      // Find the "·" separator index
      const sepIdx = chars.indexOf("·");

      // Estimate character width for particle spread
      const charWidth = entry.width / Math.max(chars.length, 1);

      chars.forEach((ch, i) => {
        if (ch === " ") return;
        const cx = rx + i * charWidth + charWidth / 2;
        const cy = ry + entry.height / 2;
        const count = randInt(2, 3);

        for (let j = 0; j < count; j++) {
          s.particles.push({
            x: cx + rand(-charWidth * 0.3, charWidth * 0.3),
            y: cy + rand(-entry.height * 0.3, entry.height * 0.3),
            vx: rand(-2, 2),
            vy: rand(-4, -1),
            size: rand(1, 3),
            color: sepIdx >= 0 && i >= sepIdx ? colors.textMuted : colors.accent,
            phase: "fall",
            life: randInt(400, 600),
          });
        }
      });

      // Fade the DOM element
      entry.el.style.transition = "opacity 300ms ease-out";
      entry.el.style.opacity = "0";
    }

    function checkTimestampProximity(): void {
      const c = s.cluster;
      const clusterY = c.y;

      for (const entry of s.timestamps) {
        if (entry.dissolved) continue;
        const centerY = entry.top + entry.height / 2;
        if (Math.abs(clusterY - centerY) < PROXIMITY_THRESHOLD) {
          dissolveTimestamp(entry);
        }
      }
    }

    function destroyThinkingBlock(el: HTMLElement): void {
      const canvasRect = canvas!.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const rx = rect.left - canvasRect.left;
      const ry = rect.top - canvasRect.top;
      const rw = rect.width;
      const rh = rect.height;

      // Gentle particles from the text region
      const count = randInt(15, 25);
      for (let i = 0; i < count; i++) {
        const px = rx + rand(0, rw);
        const py = ry + rand(rh * 0.3, rh * 0.9);
        s.particles.push({
          x: px,
          y: py,
          vx: rand(-1.5, 1.5),
          vy: rand(-3, -1),
          size: rand(1, 2),
          color: py < ry + rh * 0.4 ? colors.accent : colors.textMuted,
          phase: "fall",
          life: randInt(600, 1000),
        });
      }

      // Fade the entire block
      el.style.transition = "opacity 300ms ease-out";
      el.style.opacity = "0";
    }

    function strikeRow(): void {
      const c = s.cluster;
      if (c.rowIndex < 0 || c.rowIndex >= s.rows.length) return;
      const row = s.rows[c.rowIndex];
      if (!completeRow(row)) return;

      // Impact point in canvas (screen) coordinates for destruction effects.
      const frame = currentOrigin();
      const impactX = row.contentCenterX + frame.originX;
      const impactY = row.contentCenterY - getScrollTop() + frame.originY;

      row.elements.forEach((element) => {
        destroyByType(element, impactX, impactY, row);
      });
      spawnImpact(row);
      beginOwnerAbsorption(row, impactX, impactY);
    }


    // ── Phase updates ──

    function updateFx(): void {
      for (const ring of s.impactRings) { ring.r += 2.4; ring.life -= 0.05; }
      s.impactRings = s.impactRings.filter((r) => r.life > 0);
      if (s.shake > 0) s.shake *= 0.88;
    }

    function updateCascade(dt: number, dtFactor: number): void {
      s.phaseTime += dt;
      updateFx();
      const c = s.cluster;

      // If no rows, transition after 2s
      if (s.rows.length === 0 && s.phaseTime > 2000 && !s.gatherStarted) {
        startGather();
        return;
      }
      switch (c.hopState) {
        case "drop": {
          // Descend from above-screen to first row
          if (s.rows.length > 0 && c.rowIndex === -1) {
            c.rowIndex = 0;
            c.x = s.rows[0].landingX;
          }

          const targetY = s.rows.length > 0 ? s.rows[0].landingY : H / 2;
          c.y += DROP_SPEED * dtFactor;

          if (c.y >= targetY) {
            c.y = targetY;
            c.hopState = "squash";
            c.hopTimer = SQUASH_MS;
            strikeRow();
          }
          break;
        }

        case "squash": {
          c.hopTimer -= dt;
          const t = clamp(1 - c.hopTimer / SQUASH_MS, 0, 1);
          s.scaleY = lerp(1.0, 0.6, t);
          s.scaleX = lerp(1.0, 1.3, t);

          if (c.hopTimer <= 0) {
            c.hopState = "stretch";
            c.hopTimer = STRETCH_MS;
          }
          break;
        }

        case "stretch": {
          c.hopTimer -= dt;
          const t = clamp(1 - c.hopTimer / STRETCH_MS, 0, 1);
          s.scaleY = lerp(0.6, 1.2, t);
          s.scaleX = lerp(1.3, 0.85, t);

          if (c.hopTimer <= 0) {
            s.scaleY = 1;
            s.scaleX = 1;
            c.hopState = "dwell";
            c.hopTimer = DWELL_MS;
          }
          break;
        }

        case "dwell": {
          c.hopTimer -= dt;
          s.breathPhase += dt * (Math.PI * 2 / 600); // 600ms breathing cycle
          const breathScale = 1.0 + Math.sin(s.breathPhase) * 0.02;
          s.scaleX = breathScale;
          s.scaleY = breathScale;

          if (c.hopTimer <= 0) {
            s.scaleX = 1;
            s.scaleY = 1;
            launchHop();
          }
          break;
        }

        case "absorbing": {
          c.hopTimer -= dt;
          const t = clamp(1 - c.hopTimer / ABSORB_MS, 0, 1);
          const pulse = Math.sin(t * Math.PI) * 0.08;
          s.scaleX = 1 + pulse;
          s.scaleY = 1 - pulse * 0.5;
          if (c.hopTimer <= 0) {
            s.scaleX = 1;
            s.scaleY = 1;
            finishOwnerAbsorption();
            launchHop();
          }
          break;
        }

        case "hopping": {
          c.hopProgress += dt / c.hopDuration;
          const t = clamp(c.hopProgress, 0, 1);
          const et = easeOutQuad(t);

          // Sine arc — properly traverses from start to end
          const gap = Math.abs(c.hopEndY - c.hopStartY);
          const rawPeak = Math.max(40, gap * 0.55);
          const midY = (c.hopStartY + c.hopEndY) / 2;
          const peakHeight = Math.min(rawPeak, Math.max(0, midY));
          c.y = lerp(c.hopStartY, c.hopEndY, t) - peakHeight * Math.sin(t * Math.PI);
          c.x = lerp(c.hopStartX, c.hopEndX, et);

          if (t >= 1.0) {
            c.y = c.hopEndY;
            c.x = c.hopEndX;
            c.hopProgress = 0;

            // Advance to the row that launchHop found
            const newIndex = c.nextRowIndex;
            c.nextRowIndex = -1;
            if (newIndex < 0 || newIndex >= s.rows.length) {
              // No valid next row — start gather
              startGather();
              return;
            }
            c.rowIndex = newIndex;
            c.hopState = "squash";
            c.hopTimer = SQUASH_MS;
            strikeRow();
          }
          break;
        }
      }


      // ── Timestamp proximity check (hop and dwell only) ──
      if (c.hopState === "hopping" || c.hopState === "dwell") {
        checkTimestampProximity();
      }
      // Update cascade particles (life + off-screen removal, no floor bounce)
      const toRemove: Particle[] = [];
      for (const p of s.particles) {
        if (p.phase === "attract") {
          if (p.tx === undefined || p.ty === undefined) {
            toRemove.push(p);
            continue;
          }
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const radialForce = clamp(18 / dist, 0.12, 0.9) * dtFactor;
          const tangentForce = Math.min(0.22, dist * 0.0015) * (p.orbit ?? 1);
          p.vx += (dx / dist) * radialForce - (dy / dist) * tangentForce;
          p.vy += (dy / dist) * radialForce + (dx / dist) * tangentForce;
          p.vx *= 0.9;
          p.vy *= 0.9;
          p.x += p.vx * dtFactor;
          p.y += p.vy * dtFactor;
          p.size *= 0.975;
          if (p.life !== undefined) p.life -= dt;
          if (dist < 6 || (p.life !== undefined && p.life <= 0)) {
            toRemove.push(p);
          }
          continue;
        }
        if (p.phase !== "fall") continue;
        p.vy += 0.28 * dtFactor;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.995;
        if (p.life !== undefined) p.life -= dt;
        if (p.y > H + 10 || (p.life !== undefined && p.life <= 0)) {
          toRemove.push(p);
        }
      }
      if (toRemove.length > 0) s.particles = s.particles.filter(p => !toRemove.includes(p));

      // Update shards
      for (const sh of s.shards) {
        sh.x += sh.vx;
        sh.y += sh.vy;
        sh.vy += 0.15 * dtFactor;
        sh.rotation += sh.rotationSpeed;
        sh.life -= dt;
      }
      s.shards = s.shards.filter((sh) => sh.life > 0);

      autoScroll();
    }

    function updateGather(dt: number, dtFactor: number): void {
      s.phaseTime += dt;
      updateFx();

      if (s.particles.length < s.targetPoints.length && s.particles.length < MAX_PARTICLES) {
        const needed = Math.min(s.targetPoints.length - s.particles.length, 50);
        for (let i = 0; i < needed && s.particlesAssigned < s.targetPoints.length; i++) {
          const t = s.targetPoints[s.particlesAssigned++];
          s.particles.push({
            x: rand(0, W),
            y: H + rand(20, 80),
            vx: rand(-2, 2),
            vy: rand(-8, -3),
            size: rand(2, 4),
            color: s.letterColorMap[t.letter] ?? colors.text,
            phase: "fall",
            tx: t.x,
            ty: t.y,
            gatherDelay: rand(20, 80),
          });
        }
      }

      for (const p of s.particles) {
        if (p.phase === "fall") {
          p.vy += 0.28 * dtFactor;
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.995;
          if (p.y > H - 4) { p.y = H - 4; p.vy *= -0.3; p.vx *= 0.75; }
          if (p.tx !== undefined && p.gatherDelay !== undefined) {
            p.gatherDelay -= dt;
            if (p.gatherDelay <= 0) {
              p.phase = "gather";
            }
          }
        } else if (p.phase === "gather") {
          if (p.tx === undefined || p.ty === undefined) continue;
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 4) {
            p.x = p.tx;
            p.y = p.ty;
            p.phase = "formed";
            p.flash = 1;
            s.impactRings.push({ x: p.x, y: p.y, r: 2, life: 1 });
            s.shake = Math.min(s.shake + 2.5, 8);
          } else {
            const force = 0.55;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
            p.vx *= 0.88;
            p.vy *= 0.88;
            p.x += p.vx;
            p.y += p.vy;
          }
        } else if (p.phase === "formed") {
          if (p.flash !== undefined) p.flash *= 0.92;
        }
      }

      for (const sh of s.shards) {
        sh.x += sh.vx;
        sh.y += sh.vy;
        sh.vy += 0.12 * dtFactor;
        sh.rotation += sh.rotationSpeed;
        sh.life -= dt;
      }
      s.shards = s.shards.filter((sh) => sh.life > 0);

      if (
        s.particles.length > 0 &&
        s.particles.every((p) => p.phase === "formed") &&
        s.phaseTime > 800
      ) {
        s.phase = "formed";
        s.phaseTime = 0;
        s.formedTime = 0;
      }
      // Fallback: force transition after 5s even if no particles
      if (s.phaseTime > 5000) {
        s.phase = "formed";
        s.phaseTime = 0;
        s.formedTime = 0;
      }
    }

    function updateFormed(dt: number, dtFactor: number): void {
      s.phaseTime += dt;
      s.formedTime += dt;
      updateFx();
      for (const p of s.particles) {
        if (p.flash !== undefined) p.flash *= 0.92;
      }

      for (const sh of s.shards) {
        sh.x += sh.vx;
        sh.y += sh.vy;
        sh.vy += 0.1 * dtFactor;
        sh.rotation += sh.rotationSpeed;
        sh.life -= dt;
      }
      s.shards = s.shards.filter((sh) => sh.life > 0);

      if (s.formedTime > 600 && artifactReadyRef.current && !onCompleteCalledRef.current) {
        onCompleteCalledRef.current = true;
        onCompleteRef.current();
      }
      if (s.formedTime > 5000 && !onCompleteCalledRef.current) {
        onCompleteCalledRef.current = true;
        onCompleteRef.current();
      }
    }

    // ── Drawing ──

    function drawCluster(): void {
      if (s.phase !== "cascade") return;
      if (s.cluster.hopState === "drop" && s.rows.length === 0) return;

      const c = s.cluster;
      const frame = currentOrigin();
      const vx = c.x + frame.originX;                    // canvas-space X
      const vy = c.y - getScrollTop() + frame.originY;   // canvas-space Y
      const scaleX = s.scaleX;
      const scaleY = s.scaleY;

      // Determine contact foot for transform origin (canvas space).
      let footX = vx;
      if (c.rowIndex >= 0 && c.rowIndex < s.rows.length) {
        const row = s.rows[c.rowIndex];
        const rowLeft = row.left + frame.originX;
        const dFootX = vx + CLUSTER_OFFSETS[0].ox;  // first "d" (leftmost)
        const eFootX = vx + CLUSTER_OFFSETS[5].ox;  // "e" (rightmost)
        const dInBounds = dFootX >= rowLeft && dFootX <= rowLeft + row.width;
        const eInBounds = eFootX >= rowLeft && eFootX <= rowLeft + row.width;
        if (dInBounds && eInBounds) {
          footX = (dFootX + eFootX) / 2;
        } else {
          footX = dFootX;
        }
      }

      ctx.save();
      ctx.translate(footX, vy);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-footX, -vy);

      for (const offset of CLUSTER_OFFSETS) {
        const char = offset.char;
        const jx = rand(-2, 2);
        const jy = rand(-2, 2);
        const lx = vx + offset.ox + jx;
        const ly = vy + offset.oy + jy;

        ctx.font = `700 ${CLUSTER_SIZE}px "Geist", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = letterColorMap[char] ?? colors.text;
        ctx.fillText(char, lx, ly);
      }

      ctx.restore();
    }

    function drawParticles(): void {
      for (const p of s.particles) {
        const size = p.phase === "formed" ? p.size * (1 + (p.flash ?? 0) * 3) : p.size;
        if (p.phase === "formed" && (p.flash ?? 0) > 0.3) {
          ctx.globalCompositeOperation = "lighter";
        }
        let dx = p.x;
        let dy = p.y;
        // Water ripple effect while waiting for artifact
        if (p.phase === "formed" && !artifactReadyRef.current) {
          const t = s.formedTime;
          dx += Math.sin(p.y * 0.04 + t * 0.002) * Math.cos(p.x * 0.03 + t * 0.0015) * 2.5;
          dy += Math.cos(p.x * 0.04 + t * 0.002) * Math.sin(p.y * 0.03 + t * 0.0015) * 2.5;
        }
        ctx.beginPath();
        ctx.arc(dx, dy, size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
    }

    function drawRings(): void {
      for (const ring of s.impactRings) {
        ctx.globalAlpha = Math.max(0, ring.life);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawShards(): void {
      for (const sh of s.shards) {
        ctx.save();
        ctx.translate(sh.x, sh.y);
        ctx.rotate(sh.rotation);
        ctx.globalAlpha = Math.max(0, sh.life / 500);
        ctx.beginPath();
        if (sh.points.length > 0) {
          ctx.moveTo(sh.points[0].x, sh.points[0].y);
          for (let i = 1; i < sh.points.length; i++) {
            ctx.lineTo(sh.points[i].x, sh.points[i].y);
          }
          ctx.closePath();
        } else {
          ctx.arc(0, 0, sh.size * 3, 0, Math.PI * 2);
        }
        ctx.fillStyle = sh.color;
        ctx.fill();
        ctx.strokeStyle = sh.color;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.restore();
      }
    }

    function drawFormedGlow(now: number): void {
      if (s.phase !== "formed") return;
      const cx = W / 2;
      const cy = H / 2;
      const breathe = Math.sin(now * 0.002) * 0.5 + 0.5;
      const alpha = Math.floor((0.05 + breathe * 0.08) * 255)
        .toString(16)
        .padStart(2, "0");
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.4);
      g.addColorStop(0, colors.accent + alpha);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    }

    function drawHUD(): void {
      const labels: Record<Phase, string> = {
        cascade: "CASCADE ACTIVE",
        gather: "PARTICLE CONVERGENCE",
        formed: "FORMATION COMPLETE",
      };
      ctx.save();
      ctx.font = "600 11px 'Geist Mono', 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = colors.textMuted;
      ctx.fillText(labels[s.phase], W - 20, H - 16);
      ctx.restore();
    }

    // ── Main loop ──
    let lastTime = performance.now();

    function firstFrame(_now: number): void {
      W = container.clientWidth;
      H = container.clientHeight;
      if (W === 0 || H === 0) {
        rafId = requestAnimationFrame(firstFrame);
        return;
      }
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = W + "px";
      canvas!.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.W = W;
      s.H = H;

      // Without the chat scroll frame, a spatially correct cascade is
      // impossible. Skip directly to gather instead of guessing coordinates.
      if (!scrollContainer) {
        startGather();
        lastTime = performance.now();
        rafId = requestAnimationFrame(frame);
        return;
      }

      // ── Initialize cascade ──
      s.rows = buildRowList();
      initializeContainerCounts(s.rows);

      s.timestamps = buildTimestampList();

      // Init cluster
      s.cluster.x = W / 2;
      s.cluster.y = -(rand(60, 140));
      s.cluster.hopState = "drop";
      s.cluster.rowIndex = -1;

      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
    }

    let rafId = 0;

    function frame(now: number): void {
      const dt = Math.min(now - lastTime, 33);
      lastTime = now;
      const dtFactor = dt / 16.667;

      ctx.clearRect(0, 0, W, H);

      ctx.save();

      if (s.shake > 0.1) {
        ctx.translate(rand(-s.shake, s.shake), rand(-s.shake, s.shake));
      }
      drawFormedGlow(now);
      drawCluster();
      drawParticles();
      drawRings();
      drawShards();

      ctx.restore();

      switch (s.phase) {
        case "cascade":
          updateCascade(dt, dtFactor);
          break;
        case "gather":
          updateGather(dt, dtFactor);
          break;
        case "formed":
          updateFormed(dt, dtFactor);
          break;
      }

      drawHUD();
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(firstFrame);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.cursor = prevCursor;
      if (scrollContainer) {
        scrollContainer.style.overflow = prevOverflow;
        scrollContainer.style.opacity = prevOpacity;
        scrollContainer.style.transition = prevTransition;
        scrollContainer.scrollTop = prevScrollTop;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        zIndex: 50,
        inset: 0,
        background: "transparent",
        pointerEvents: "none",
      }}
    />
  );
}
