import { useEffect, useRef } from "react";
import type { Particle, ImpactRing, Shard } from "../animation/types";

interface TransitionCanvasProps {
  artifactReady: boolean;
  onComplete: () => void;
}

type Phase = "cascade" | "gather" | "formed";

interface CascadeRow {
  el: HTMLElement;
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
  targetPoints: { x: number; y: number }[];
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
}

interface ThemeColors {
  accent: string;
  text: string;
  textMuted: string;
}

const MAX_PARTICLES = 2500;
const DPR_CAP = 2;

// ── Hop-step constants ──
const HOP_G = 0.002;
const SQUASH_MS = 80;
const STRETCH_MS = 60;
const DWELL_MS = 300;
const CLUSTER_SIZE = 22;
const CLUSTER_WIDTH = 28; // approximate width for X-variance constraint
const DROP_SPEED = 4;
const SAFETY_TIMEOUT_MS = 8000;

// ── Cluster offsets (2×2) ──
const CLUSTER_OFFSETS = [
  { char: "d", ox: -10, oy: -8 },
  { char: "s", ox: +4,  oy: -8 },
  { char: "c", ox: -8,  oy: +6 },
  { char: "o", ox: +6,  oy: +6 },
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

export function TransitionCanvas({ artifactReady, onComplete }: TransitionCanvasProps) {
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
    const warmPurple = `hsl(${(accentHue + 55) % 360}, 55%, 52%)`;
    const letterColorMap: Record<string, string> = {
      d: colors.accent,
      s: warmPurple,
      c: "#eab308",
      o: colors.text,
    };

    // ── Size canvas (deferred to first rAF to avoid 0×0 race) ──
    let W = 0, H = 0;
    const container = canvas.parentElement!;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

    // ── Lock scroll during animation ──
    const scrollContainer = (() => { let p = container.parentElement; while (p) { const oy = getComputedStyle(p).overflowY; if (oy === "auto" || oy === "scroll") return p; p = p.parentElement; } return null; })();
    let prevScrollTop = 0;
    let prevOverflow = "";
    if (scrollContainer) {
      prevScrollTop = scrollContainer.scrollTop;
      prevOverflow = scrollContainer.style.overflow;
      scrollContainer.style.overflow = "hidden";
    }

    // ── Offscreen canvas for DSCode wordmark ──
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

    function renderTargets(): { x: number; y: number }[] {
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

      const imageData = offCtx.getImageData(0, 0, Math.floor(W * dpr), Math.floor(H * dpr));
      const points: { x: number; y: number }[] = [];
      const step = 6;
      for (let py = 0; py < H; py += step) {
        for (let px = 0; px < W; px += step) {
          const idx = (Math.floor(py * dpr) * Math.floor(W * dpr) + Math.floor(px * dpr)) * 4;
          if (idx + 3 < imageData.data.length && imageData.data[idx + 3] > 128) {
            points.push({ x: px, y: py });
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

      all.forEach((el) => {
        if (el.querySelector("[data-collider]")) return;
        // ── Nesting exclusion: skip elements that contain child [data-collider] (keep leaves only) ──

        // ── Universal empty filter: skip empty/whitespace-only colliders ──
        if (!el.textContent?.trim()) return;

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

        const colliderType = el.getAttribute("data-collider");
        let width = rect.width;

        // ── Content-tight width for text-like colliders ──
        if (colliderType === "text-line" || colliderType === "code-line" || colliderType === "tool-result-line") {
          const text = el.textContent || "";
          const computedStyle = getComputedStyle(el);
          measureCtx.font = `${computedStyle.fontWeight || "400"} ${computedStyle.fontSize} "${computedStyle.fontFamily.split(",")[0].replace(/"/g, "")}", sans-serif`;
          const measuredWidth = measureCtx.measureText(text).width + 4; // 4px padding
          width = Math.min(rect.width, measuredWidth);
        }

        // ── Random landing X ──
        const left = rect.left - canvasRect.left;
        const landingX = left + rand(width * 0.15, width * 0.85);

        rows.push({
          el,
          top,
          left,
          width,
          height: rect.height,
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
          rows[i].landingX = rows[i].left + rand(rows[i].width * 0.15, rows[i].width * 0.85);
          attempts++;
        }
      }

      return rows;
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
      },
      rows: [],
      scaleX: 1,
      scaleY: 1,
      breathPhase: 0,
      letterColorMap,
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
      const isCard = el.getAttribute("data-collider") === "tool-card" || el.getAttribute("data-collider") === "message-card";
      const count = isCard ? randInt(30, 50) : randInt(20, 40);
      for (let i = 0; i < count; i++) {
        const px = rx + rand(0, rw);
        const py = ry + rand(0, rh);
        const angle = Math.atan2(py - (ry + rh / 2), px - (rx + rw / 2));
        const speed = rand(2, 8);
        const warmColors = [colors.accent, "#eab308", warmPurple, colors.text];
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
      if (text.length > 80) {
        spawnParticles(el);
        return;
      }
      const chars = [...text];
      el.innerHTML = "";
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
        el.appendChild(span);
      });
      setTimeout(() => {
        el.style.opacity = "0";
        if (document.getElementById(styleId)) {
          document.getElementById(styleId)!.remove();
        }
      }, 450);
    }

    function destroyCodeLine(el: HTMLElement): void {
      const originalText = el.textContent || "";
      const chars = [...originalText];

      function corrupt(ratio: number, jitter: number): void {
        const result = chars.map((ch, i) => {
          if (ch === " " || ch === "\n") return ch;
          if (Math.random() < ratio) return "▓";
          return ch;
        });
        el.textContent = result.join("");
        if (jitter > 0) {
          el.style.transform = `translateX(${rand(-jitter, jitter)}px)`;
        }
      }

      corrupt(0.3, 0);
      setTimeout(() => corrupt(0.6, 8), 40);
      setTimeout(() => {
        corrupt(1.0, 4);
        el.style.transition = "opacity 200ms ease-out";
        el.style.opacity = "0";
      }, 80);
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
          color: rand(0, 1) > 0.5 ? colors.accent : warmPurple,
          phase: "fall",
          life: randInt(2000, 3500),
        });
      }
    }

    function destroyMessageCard(el: HTMLElement): void {
      // Lightweight — gentle bg flash + shards. Don't change opacity
      // so child colliders stay visible for individual striking.
      el.style.transition = "none";
      el.style.backgroundColor = "rgba(255,255,255,0.5)";
      requestAnimationFrame(() => {
        el.style.transition = "background-color 80ms ease-out";
        el.style.backgroundColor = "transparent";
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
      el.innerHTML = "";
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
        el.appendChild(span);
      });
      setTimeout(() => {
        el.style.opacity = "0";
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
        return;
      }
      const chars = [...text];
      el.innerHTML = "";
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
        el.appendChild(span);
      });
      setTimeout(() => {
        el.style.opacity = "0";
        if (document.getElementById(styleId)) {
          document.getElementById(styleId)!.remove();
        }
      }, 330);
    }

    function destroyByType(el: HTMLElement, impactX: number, impactY: number): void {
      const type = el.getAttribute("data-collider");
      switch (type) {
        case "text-line":
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
        default:
          spawnParticles(el);
          break;
      }
    }

    function startGather(): void {
      if (s.gatherStarted) return;
      s.gatherStarted = true;
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


      // ── Final sweep: clean up any remaining parent containers ──
      const parents = container.querySelectorAll<HTMLElement>(
        '[data-collider="tool-card"], [data-collider="message-card"]'
      );
      parents.forEach((pc) => {
        if (pc.style.opacity === "0") return;
        const children = pc.querySelectorAll<HTMLElement>("[data-collider]");
        const allDone = [...children].every((child) => {
          const cr = s.rows.find((r) => r.el === child);
          return !cr || cr.struck;
        });
        if (allDone) {
          spawnParticles(pc);
          pc.style.transition = "opacity 200ms ease-out";
          pc.style.opacity = "0";
        }
      });
    // ── Hop helpers ──

    function launchHop(): void {
      const c = s.cluster;
      const currentRow = s.rows[c.rowIndex];
      const nextIndex = c.rowIndex + 1;

      if (nextIndex >= s.rows.length) {
        // No more rows — start gather
        startGather();
        return;
      }

      const nextRow = s.rows[nextIndex];
      c.hopStartX = currentRow.landingX;
      c.hopStartY = currentRow.top;
      c.hopEndX = nextRow.landingX;
      c.hopEndY = nextRow.top;

      const gap = Math.abs(c.hopEndY - c.hopStartY);
      c.hopDuration = Math.max(350, Math.sqrt(2 * gap / HOP_G));
      c.hopProgress = 0;
      c.hopState = "hopping";
    }

    function strikeRow(): void {
      const c = s.cluster;
      if (c.rowIndex < 0 || c.rowIndex >= s.rows.length) return;
      const row = s.rows[c.rowIndex];
      if (row.struck) return;

      row.struck = true;

      // Impact effects
      const impactX = row.landingX;
      const impactY = row.top;
      const flashColor = s.letterColorMap["d"] ?? colors.accent;

      row.el.style.transition = "none";
      row.el.style.backgroundColor = "rgba(255,255,255,0.85)";
      row.el.style.boxShadow = "0 0 20px rgba(255,255,255,0.6)";

      destroyByType(row.el, impactX, impactY);

      requestAnimationFrame(() => {
        row.el.style.transition =
          "background-color 60ms ease-out, box-shadow 60ms ease-out, opacity 180ms ease-out 60ms";
        row.el.style.backgroundColor = "";
        row.el.style.boxShadow = "";
        if (row.el.getAttribute("data-collider") !== "message-card") {
          row.el.style.opacity = "0";
        }
      });

      const dx = rand(-8, 8);
      const dy = rand(-4, 2);
      row.el.style.transform = `translate(${dx}px, ${dy}px)`;
      row.el.style.transition += ", transform 120ms ease-out";

      spawnImpactFragments(impactX, impactY, flashColor);
      s.shake = Math.max(s.shake, 8);

      // ── Cleanup parent container if all children struck ──
      const parentCard = row.el.closest<HTMLElement>(
        '[data-collider="tool-card"], [data-collider="message-card"]'
      );
      if (parentCard) {
        const siblings = parentCard.querySelectorAll<HTMLElement>("[data-collider]");
        const allStruck = [...siblings].every((child) => {
          const childRow = s.rows.find((r) => r.el === child);
          return !childRow || childRow.struck === true;
        });
        if (allStruck) {
          spawnParticles(parentCard);
          parentCard.style.transition = "opacity 200ms ease-out";
          parentCard.style.opacity = "0";
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

          // Parabolic arc
          const peakHeight = Math.max(40, Math.abs(c.hopEndY - c.hopStartY) * 1.5);
          const vy0 = Math.sqrt(2 * HOP_G * peakHeight);
          const arcY = c.hopStartY - (vy0 * t * c.hopDuration / 1000 - 0.5 * HOP_G * Math.pow(t * c.hopDuration / 1000, 2));

          c.y = arcY;
          c.x = lerp(c.hopStartX, c.hopEndX, et);

          if (t >= 1.0) {
            c.y = c.hopEndY;
            c.x = c.hopEndX;
            c.hopProgress = 0;

            // Advance to next row
            const newIndex = c.rowIndex + 1;
            if (newIndex >= s.rows.length) {
              // All rows visited — start gather
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
            color: colors.text,
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
        const dFootX = c.x + CLUSTER_OFFSETS[0].ox;
        const cFootX = c.x + CLUSTER_OFFSETS[2].ox;
        const dInBounds = dFootX >= row.left && dFootX <= row.left + row.width;
        const cInBounds = cFootX >= row.left && cFootX <= row.left + row.width;
        if (dInBounds && cInBounds) {
          originX = (dFootX + cFootX) / 2;
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
