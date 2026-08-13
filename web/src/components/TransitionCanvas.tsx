import { useEffect, useRef } from "react";
import type { Particle, ImpactRing, Shard, TimestampEntry } from "../animation/types";
import {
  groupCascadeColliderFragments,
  hasRenderableColliderContent,
  selectNextCascadeRowIndex,
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
  struck: boolean;
}

type HopState = "drop" | "squash" | "stretch" | "dwell" | "hopping";

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
const CLUSTER_SIZE = 22;
const CLUSTER_WIDTH = 70; // approximate width for X-variance constraint (6 letters, 16px spacing)
const DROP_SPEED = 4;
const SAFETY_TIMEOUT_MS = 8000;

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

    // ── Lock scroll during animation ──
    const sc = scrollContainerRef?.current ?? (() => { let p = container.parentElement; while (p) { const oy = getComputedStyle(p).overflowY; if (oy === "auto" || oy === "scroll") return p; p = p.parentElement; } return null; })();
    const scrollContainer = sc;
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
    }

    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d")!;

    // ── Offscreen canvas for text measurement ──
    const measureCanvas = document.createElement("canvas");
    const measureCtx = measureCanvas.getContext("2d")!;

    // ── Scroll ancestor helper ──
    function findScrollAncestor(el: HTMLElement): HTMLElement | null {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const overflowY = getComputedStyle(p).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") return p;
        p = p.parentElement;
      }
      return null;
    }

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

    // ── Row list builder ──
    function buildRowList(): CascadeRow[] {
      const all = container.querySelectorAll<HTMLElement>("[data-collider]");
      const canvasRect = canvas!.getBoundingClientRect();
      const rows: CascadeRow[] = [];
      const fragments: Array<{
        el: HTMLElement;
        blockId: string | null;
        top: number;
        bottom: number;
        left: number;
        right: number;
      }> = [];
      const clusterHalf = Math.abs(CLUSTER_OFFSETS[0].ox); // 40px

      all.forEach((el) => {
        if (el.querySelector("[data-collider]")) return;
        // ── Nesting exclusion: skip elements that contain child [data-collider] (keep leaves only) ──

        const colliderType = el.getAttribute("data-collider");
        // Media colliders are renderable without textContent.
        if (!hasRenderableColliderContent(colliderType, el.textContent)) return;

        const rect = el.getBoundingClientRect();
        const top = rect.top - canvasRect.top;
        const bottom = top + rect.height;

        // Visibility filter: exclude rows not intersecting canvas
        if (top >= H || bottom <= 0) return;

        // ── Scroll-clip visibility: exclude rows entirely outside their scroll ancestor ──
        const scrollAncestor = findScrollAncestor(el);
        if (scrollAncestor) {
          const saRect = scrollAncestor.getBoundingClientRect();
          if (rect.bottom <= saRect.top || rect.top >= saRect.bottom) return;
        }

        let width = rect.width;

        // ── Content-tight width for text-like colliders ──
        if (
          colliderType === "text-block"
          || colliderType === "code-line"
          || colliderType === "tool-result-line"
        ) {
          const text = el.textContent || "";
          const computedStyle = getComputedStyle(el);
          measureCtx.font = `${computedStyle.fontWeight || "400"} ${computedStyle.fontSize} "${computedStyle.fontFamily.split(",")[0].replace(/"/g, "")}", sans-serif`;
          const measuredWidth = measureCtx.measureText(text).width + 4; // 4px padding
          width = Math.min(rect.width, measuredWidth);
        }

        const left = rect.left - canvasRect.left;
        fragments.push({
          el,
          blockId: colliderType === "text-line"
            ? el.dataset.colliderBlock ?? null
            : null,
          top,
          bottom,
          left,
          right: left + width,
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
        const elements = group.indices.map((index) => fragments[index].el);
        const width = group.right - group.left;
        const height = group.bottom - group.top;

        // ── Random landing X ──
        let landingX: number;
        if (width >= CLUSTER_WIDTH) {
          const lo = group.left + clusterHalf;
          const hi = group.right - clusterHalf;
          landingX = lo + rand(0, hi - lo);
        } else {
          landingX = group.left + width / 2;
        }

        rows.push({
          el: elements[0],
          elements,
          top: group.top,
          left: group.left,
          width,
          height,
          landingX,
          struck: false,
        });
      });

      // Sort by visual Y position for correct top-to-bottom cascade
      rows.sort((a, b) => a.top - b.top);

      // ── Enforce consecutive-row X variation ──
      for (let i = 1; i < rows.length; i++) {
        let attempts = 0;
        while (Math.abs(rows[i].landingX - rows[i - 1].landingX) < CLUSTER_WIDTH * 0.3 && attempts < 5) {
          rows[i].landingX = (rows[i].width >= CLUSTER_WIDTH) ? rows[i].left + clusterHalf + rand(0, rows[i].width - CLUSTER_WIDTH) : rows[i].left + rows[i].width / 2;
          attempts++;
        }
      }

      return rows;
    }

    function measureRow(
      row: CascadeRow,
      canvasRect: DOMRect,
    ): { top: number; bottom: number; left: number; right: number } {
      const rects = row.elements.map((element) =>
        element.getBoundingClientRect()
      );
      return {
        top: Math.min(...rects.map((rect) => rect.top)) - canvasRect.top,
        bottom: Math.max(...rects.map((rect) => rect.bottom)) - canvasRect.top,
        left: Math.min(...rects.map((rect) => rect.left)) - canvasRect.left,
        right: Math.max(...rects.map((rect) => rect.right)) - canvasRect.left,
      };
    }

    // ── Timestamp list builder ──
    function buildTimestampList(): TimestampEntry[] {
      const all = container.querySelectorAll<HTMLElement>(".meta");
      const canvasRect = canvas!.getBoundingClientRect();
      const entries: TimestampEntry[] = [];

      all.forEach((el) => {
        // Skip timestamps nested inside [data-collider] elements (e.g. inside cards)
        if (el.closest("[data-collider]")) return;
        if (!el.textContent?.trim()) return;

        const rect = el.getBoundingClientRect();
        const top = rect.top - canvasRect.top;
        const bottom = top + rect.height;

        // Visibility filter
        if (top >= H || bottom <= 0) return;

        entries.push({
          el,
          top,
          left: rect.left - canvasRect.left,
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

    function spawnImpactFragments(x: number, y: number, color: string): void {
      const count = randInt(6, 12);
      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(2, 6);
        s.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - rand(1, 3),
          size: rand(1, 3),
          color,
          phase: "fall",
          life: randInt(800, 1800),
        });
      }
    }

    // ── Per-type destruction effects ──

    function destroyTextLine(el: HTMLElement): void {
      const text = el.textContent || "";

      // Empty line — skip clone, just fade
      if (text.trim() === "") {
        el.style.opacity = "0";
        return;
      }

      if (text.length > 80) {
        spawnParticles(el);
        el.style.transition = "opacity 180ms ease-out";
        el.style.opacity = "0";
        return;
      }

      const originalColor = getComputedStyle(el).color;

      // Hide original children (preserve layout)
      for (const child of Array.from(el.children)) {
        (child as HTMLElement).style.visibility = "hidden";
      }

      // Clone content into absolute overlay
      const clone = el.cloneNode(true) as HTMLElement;
      clone.innerHTML = "";
      clone.style.position = "absolute";
      clone.style.top = "0";
      clone.style.left = "0";
      clone.style.pointerEvents = "none";
      clone.style.color = originalColor;
      el.style.position = "relative";
      el.style.overflow = "visible";
      el.style.color = "transparent";
      el.style.textDecorationColor = "transparent";

      const chars = [...text];
      const style = document.createElement("style");
      const styleId = `char-scatter-${Date.now()}`;
      style.id = styleId;
      style.textContent = `
        @keyframes charScatter {
          0% { opacity: 1; transform: translate(0, 0) rotate(0deg); }
          100% { opacity: 0; transform: translate(var(--sx), var(--sy)) rotate(var(--sr)); }
        }
      `;
      document.head.appendChild(style);
      chars.forEach((ch) => {
        const span = document.createElement("span");
        span.textContent = ch === " " ? "\u00A0" : ch;
        span.style.display = "inline-block";
        span.style.setProperty("--sx", `${rand(-60, 60)}px`);
        span.style.setProperty("--sy", `${rand(-80, 20)}px`);
        span.style.setProperty("--sr", `${rand(-180, 180)}deg`);
        span.style.animation = "charScatter 400ms ease-out forwards";
        clone.appendChild(span);
      });

      el.appendChild(clone);

      setTimeout(() => {
        el.style.opacity = "0";
        clone.remove();
        if (document.getElementById(styleId)) {
          document.getElementById(styleId)!.remove();
        }
      }, 450);
    }

    function destroyCodeLine(el: HTMLElement): void {
      const originalText = el.textContent || "";
      const chars = [...originalText];
      const originalColor = getComputedStyle(el).color;

      // Hide original children (preserve layout)
      for (const child of Array.from(el.children)) {
        (child as HTMLElement).style.visibility = "hidden";
      }

      // Clone content into absolute overlay
      const clone = el.cloneNode(true) as HTMLElement;
      clone.innerHTML = "";
      clone.textContent = originalText;
      clone.style.position = "absolute";
      clone.style.top = "0";
      clone.style.left = "0";
      clone.style.pointerEvents = "none";
      clone.style.color = originalColor;
      el.style.position = "relative";
      el.style.overflow = "visible";
      el.style.color = "transparent";
      el.style.textDecorationColor = "transparent";

      function corrupt(ratio: number, jitter: number): void {
        const result = chars.map((ch, i) => {
          if (ch === " " || ch === "\n") return ch;
          if (Math.random() < ratio) return "▓";
          return ch;
        });
        clone.textContent = result.join("");
        if (jitter > 0) {
          clone.style.transform = `translateX(${rand(-jitter, jitter)}px)`;
        }
      }

      corrupt(0.3, 0);
      setTimeout(() => corrupt(0.6, 8), 40);
      setTimeout(() => {
        corrupt(1.0, 4);
        clone.style.transition = "opacity 200ms ease-out";
        clone.style.opacity = "0";
      }, 80);

      el.appendChild(clone);

      setTimeout(() => {
        el.style.opacity = "0";
        clone.remove();
      }, 400);
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

    function destroyToolHeader(el: HTMLElement): void {
      const text = el.textContent || "";
      const chars = [...text];
      const originalColor = getComputedStyle(el).color;

      // Hide original children (preserve layout)
      for (const child of Array.from(el.children)) {
        (child as HTMLElement).style.visibility = "hidden";
      }

      // Clone content into absolute overlay
      const clone = el.cloneNode(true) as HTMLElement;
      clone.innerHTML = "";
      clone.style.position = "absolute";
      clone.style.top = "0";
      clone.style.left = "0";
      clone.style.pointerEvents = "none";
      clone.style.color = originalColor;
      el.style.position = "relative";
      el.style.overflow = "visible";
      el.style.color = "transparent";
      el.style.textDecorationColor = "transparent";

      const styleId = `th-scatter-${Date.now()}`;
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        @keyframes thScatter {
          0% { opacity: 1; transform: translate(0, 0) rotate(0deg); }
          100% { opacity: 0; transform: translate(var(--sx), var(--sy)) rotate(var(--sr)); }
        }
      `;
      document.head.appendChild(style);
      chars.forEach((ch) => {
        const span = document.createElement("span");
        span.textContent = ch === " " ? "\u00A0" : ch;
        span.style.display = "inline-block";
        span.style.setProperty("--sx", `${rand(-50, 50)}px`);
        span.style.setProperty("--sy", `${rand(-60, 10)}px`);
        span.style.setProperty("--sr", `${rand(-180, 180)}deg`);
        span.style.animation = "thScatter 350ms ease-out forwards";
        clone.appendChild(span);
      });

      el.appendChild(clone);

      setTimeout(() => {
        el.style.opacity = "0";
        clone.remove();
        if (document.getElementById(styleId)) {
          document.getElementById(styleId)!.remove();
        }
      }, 380);
    }

    function destroyToolResultLine(el: HTMLElement): void {
      // Similar to destroyTextLine but with more subtle scatter (tool results are secondary)
      const text = el.textContent || "";
      if (text.length > 100) {
        spawnParticles(el);
        el.style.transition = "opacity 180ms ease-out";
        el.style.opacity = "0";
        return;
      }
      const originalColor = getComputedStyle(el).color;

      // Hide original children (preserve layout)
      for (const child of Array.from(el.children)) {
        (child as HTMLElement).style.visibility = "hidden";
      }

      // Clone content into absolute overlay
      const clone = el.cloneNode(true) as HTMLElement;
      clone.innerHTML = "";
      clone.style.position = "absolute";
      clone.style.top = "0";
      clone.style.left = "0";
      clone.style.pointerEvents = "none";
      clone.style.color = originalColor;
      el.style.position = "relative";
      el.style.overflow = "visible";
      el.style.color = "transparent";
      el.style.textDecorationColor = "transparent";

      const chars = [...text];
      const styleId = `trl-scatter-${Date.now()}`;
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        @keyframes trlScatter {
          0% { opacity: 1; transform: translate(0, 0) rotate(0deg); }
          100% { opacity: 0; transform: translate(var(--sx), var(--sy)) rotate(var(--sr)); }
        }
      `;
      document.head.appendChild(style);
      chars.forEach((ch) => {
        const span = document.createElement("span");
        span.textContent = ch === " " ? "\u00A0" : ch;
        span.style.display = "inline-block";
        span.style.setProperty("--sx", `${rand(-40, 40)}px`);
        span.style.setProperty("--sy", `${rand(-60, 10)}px`);
        span.style.setProperty("--sr", `${rand(-120, 120)}deg`);
        span.style.animation = "trlScatter 300ms ease-out forwards";
        clone.appendChild(span);
      });

      el.appendChild(clone);

      setTimeout(() => {
        el.style.opacity = "0";
        clone.remove();
        if (document.getElementById(styleId)) {
          document.getElementById(styleId)!.remove();
        }
      }, 330);
    }
    function destroyByType(el: HTMLElement, impactX: number, impactY: number): void {
      const type = el.getAttribute("data-collider");
      switch (type) {
        case "text-block":
          destroyTextLine(el);
          break;
        case "code-line":
          destroyCodeLine(el);
          break;
        case "tool-header":
          destroyToolHeader(el);
          break;
        case "tool-result-line":
          destroyToolResultLine(el);
          break;
        case "tool-card":
          destroyToolCard(el, impactX, impactY);
          break;
        case "message-card":
          destroyMessageCard(el);
          break;
        case "agent-card":
          destroyToolCard(el, impactX, impactY);
          break;
        case "phase-label":
          destroyTextLine(el);
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
        case "table-cell":
          destroyTextLine(el);
          break;
        default:
          spawnParticles(el);
          el.style.transition = "opacity 220ms ease-out";
          el.style.opacity = "0";
          break;
      }
    }

    function startGather(): void {
      if (s.gatherStarted) return;
      s.gatherStarted = true;
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
      const canvasRect = canvas!.getBoundingClientRect();
      const currentRow = s.rows[c.rowIndex];

      // Use stored position from recalibration — the current row has already
      // been destroyed (DOM mutated by destroyByType), so its live
      // getBoundingClientRect() is unreliable. Using it as a filter baseline
      // can cause candidate rows to be incorrectly skipped.
      const liveCurrentTop = currentRow.top;

      const liveCandidates = s.rows.map((candidate, index) => {
        const geometry = measureRow(candidate, canvasRect);
        return {
          index,
          struck: candidate.struck,
          top: geometry.top,
          bottom: geometry.bottom,
          left: geometry.left,
        };
      });
      const nextIndex = selectNextCascadeRowIndex(
        liveCandidates,
        liveCurrentTop,
        H,
      );
      if (nextIndex < 0) {
        startGather();
        return;
      }

      const nextRow = s.rows[nextIndex];
      const nextGeometry = liveCandidates[nextIndex];
      c.nextRowIndex = nextIndex;
      // Update the next row's stored position to the live measurement
      nextRow.top = nextGeometry.top;
      nextRow.left = nextGeometry.left;

      c.hopStartX = currentRow.landingX;
      c.hopStartY = liveCurrentTop;
      c.hopEndX = nextRow.landingX;
      c.hopEndY = nextGeometry.top;

      const gap = Math.abs(c.hopEndY - c.hopStartY);
      c.hopDuration = Math.max(350, Math.min(800, Math.sqrt(gap) * 25));
      c.hopState = "hopping";
    }

    // ── Recursive parent container cleanup ──
    // Walks up the DOM tree checking each ancestor container (tool-card, message-card).
    // When all children of a container are struck or hidden, cleanup that container
    // and continue upward. Stops when a container still has unstruck children.
    function cleanupParents(el: HTMLElement): void {
      let current: HTMLElement | null = el.parentElement;
      while (current) {
        const type = current.getAttribute("data-collider");
        if (type !== "tool-card" && type !== "message-card" && type !== "agent-card") {
          current = current.parentElement;
          continue;
        }
        const children = current.querySelectorAll<HTMLElement>("[data-collider]");
        const allDone = [...children].every((child) => {
          const childRow = s.rows.find((r) => r.elements.includes(child));
          if (childRow && !childRow.struck) return false;
          return true;
        });
        if (!allDone) break;
        const rect = current.getBoundingClientRect();
        const canvasRect = canvas!.getBoundingClientRect();
        destroyByType(
          current,
          rect.left - canvasRect.left + rect.width / 2,
          rect.top - canvasRect.top + rect.height / 2,
        );
        current = current.parentElement;
      }
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
      if (row.struck) return;

      row.struck = true;

      // Impact effects — distributed across all six letters
      const impactX = row.landingX;
      const impactY = row.top + row.height * 0.35;

      row.elements.forEach((element) => {
        destroyByType(element, impactX, impactY);
      });
      // ── Recursive parent container cleanup ──
      cleanupParents(row.el);

      for (const offset of CLUSTER_OFFSETS) {
        const lx = c.x + offset.ox;
        const ly = c.y + offset.oy + (CLUSTER_SIZE / 2);
        const color = s.letterColorMap[offset.char] ?? colors.accent;
        spawnImpactFragments(lx, ly, color);
      }

      // ── Recalibrate all row positions ──
      // With clone+overlay, DOM is not mutated, so live positions remain accurate.
      // Re-measure all rows (including struck) for correctness.
      {
        const canvasRect = canvas!.getBoundingClientRect();

        for (let i = 0; i < s.rows.length; i++) {
          const r = s.rows[i];
          const geometry = measureRow(r, canvasRect);
          r.top = geometry.top;
          r.left = geometry.left;
          r.width = geometry.right - geometry.left;
          r.height = geometry.bottom - geometry.top;
        }
        s.rows.sort((a, b) => a.top - b.top);
        c.rowIndex = s.rows.findIndex(r => r === row);

        // Update active hop target if cluster is en route to a shifted row
        if (c.hopState === "hopping") {
          const nextIndex = c.rowIndex + 1;
          if (nextIndex < s.rows.length) {
            c.hopEndY = s.rows[nextIndex].top;
            c.hopEndX = s.rows[nextIndex].landingX;
          }
        }
      }
    }


    // ── Phase updates ──

    function updateCascade(dt: number, dtFactor: number): void {
      s.phaseTime += dt;
      const c = s.cluster;

      // If no rows, transition after 2s
      if (s.rows.length === 0 && s.phaseTime > 2000 && !s.gatherStarted) {
        startGather();
        return;
      }
      if (s.phaseTime > SAFETY_TIMEOUT_MS && !s.gatherStarted) {
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

          const targetY = s.rows.length > 0 ? s.rows[0].top : H / 2;
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

        case "hopping": {
          c.hopProgress += dt / c.hopDuration;
          const t = clamp(c.hopProgress, 0, 1);
          const et = easeOutQuad(t);

          // Sine arc — properly traverses from start to end
          // Clamp peak height to prevent arc from pushing cluster above viewport
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

            // Advance to the row that launchHop found (may have skipped rows above viewport)
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
    }

    function updateGather(dt: number, dtFactor: number): void {
      s.phaseTime += dt;

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

      for (const ring of s.impactRings) { ring.r += 2.2; ring.life -= 0.045; }
      s.impactRings = s.impactRings.filter((r) => r.life > 0);

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
      for (const ring of s.impactRings) { ring.r += 1.5; ring.life -= 0.03; }
      s.impactRings = s.impactRings.filter((r) => r.life > 0);
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
      const scaleX = s.scaleX;
      const scaleY = s.scaleY;

      // Determine contact foot for transform origin
      let originX = c.x;
      if (c.rowIndex >= 0 && c.rowIndex < s.rows.length) {
        const row = s.rows[c.rowIndex];
        const dFootX = c.x + CLUSTER_OFFSETS[0].ox;  // first "d" (leftmost)
        const eFootX = c.x + CLUSTER_OFFSETS[5].ox;  // "e" (rightmost)
        const dInBounds = dFootX >= row.left && dFootX <= row.left + row.width;
        const eInBounds = eFootX >= row.left && eFootX <= row.left + row.width;
        if (dInBounds && eInBounds) {
          originX = (dFootX + eFootX) / 2;
        } else {
          originX = dFootX;
        }
      }

      ctx.save();
      ctx.translate(originX, c.y);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-originX, -c.y);

      for (const offset of CLUSTER_OFFSETS) {
        const char = offset.char;
        const jx = rand(-2, 2);
        const jy = rand(-2, 2);
        const lx = c.x + offset.ox + jx;
        const ly = c.y + offset.oy + jy;

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
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${ring.life.toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
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

    function firstFrame(now: number): void {
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

      // ── Initialize cascade ──
      s.rows = buildRowList();

      s.timestamps = buildTimestampList();
      console.log("[dscode] timestamps:", s.timestamps.length);

      // Init cluster
      s.cluster.x = W / 2;
      s.cluster.y = -(rand(60, 140));
      s.cluster.hopState = "drop";
      s.cluster.rowIndex = -1;

      console.log("[dscode] rows:", s.rows.length, "H:", H, "W:", W);

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
        s.shake *= 0.88;
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
