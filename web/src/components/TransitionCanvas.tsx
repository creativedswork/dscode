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
  struck: boolean;
}

interface CascadeLetter {
  char: "D" | "S" | "C" | "O";
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  gravity: number;
  color: string;
  lockedElement: HTMLElement | null;
  alive: boolean;
  exitPhase: "falling" | "exiting" | "gone";
  exitTimer: number;
  glowDecay: number;
  stuckTimer: number;
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
  // ── Independent letter cascade ──
  letters: CascadeLetter[];
  rows: CascadeRow[];
  spawnTimer: number;
  nextSpawnIndex: number;
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

// ── Spawn constants ──
const SPAWN_SEQUENCE: Array<"D" | "S" | "C" | "O"> = ["D", "S", "C", "O"];
const SPAWN_DELAY_MIN = 400;
const SPAWN_DELAY_MAX = 800;
const INITIAL_SPAWN_DELAY = 200;
const LETTER_SIZE_MIN = 48;
const LETTER_SIZE_MAX = 64;
const GRAVITY_BASE = 0.25;
const GRAVITY_VARIANCE = 0.15;
const TERMINAL_VELOCITY = 8;
const BOUNCE_RESTITUTION = 0.25;
const EXIT_VELOCITY = -6;
const EXIT_FADE_MS = 500;
const STUCK_TIMEOUT_MS = 2000;
const LOCK_RELEASE_MS = 450;
const IMPACT_GLOW_MAX = 20;
const IMPACT_GLOW_DECAY = 0.92;

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
      D: colors.accent,
      S: warmPurple,
      C: "#eab308",
      O: colors.text,
    };

    // ── Size canvas (deferred to first rAF to avoid 0×0 race) ──
    let W = 0, H = 0;
    const container = canvas.parentElement!;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

    // ── Offscreen canvas for DSCode wordmark ──
    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d")!;

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
      const all = document.querySelectorAll<HTMLElement>("[data-collider]");
      const canvasRect = canvas!.getBoundingClientRect();
      const rows: CascadeRow[] = [];

      all.forEach((el) => {

        const rect = el.getBoundingClientRect();
        const top = rect.top - canvasRect.top;
        const bottom = top + rect.height;

        // Visibility filter: exclude rows not intersecting canvas
        if (top >= H || bottom <= 0) return;

        rows.push({
          el,
          top,
          left: rect.left - canvasRect.left,
          width: rect.width,
          height: rect.height,
          struck: false,
        });
      });

      // Sort by visual Y position for correct top-to-bottom cascade
      rows.sort((a, b) => a.top - b.top);
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
      letters: [],
      rows: [],
      spawnTimer: INITIAL_SPAWN_DELAY,
      nextSpawnIndex: 0,
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

    function spawnImpactFragments(x: number, y: number, vx: number, vy: number, color: string): void {
      const count = randInt(6, 12);
      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(2, 6);
        s.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed + vx * 0.3,
          vy: Math.sin(angle) * speed + vy * 0.3,
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

    // ── Letter spawning ──

    function trySpawnLetter(): void {
      if (s.nextSpawnIndex >= SPAWN_SEQUENCE.length) return;

      const char = SPAWN_SEQUENCE[s.nextSpawnIndex];
      const size = randInt(LETTER_SIZE_MIN, LETTER_SIZE_MAX);
      const gravity = GRAVITY_BASE + GRAVITY_BASE * rand(-GRAVITY_VARIANCE, GRAVITY_VARIANCE);

      const letter: CascadeLetter = {
        char,
        x: rand(80, W - 80),
        y: -(rand(60, 140)),
        vx: rand(-1, 1),
        vy: 2,
        size,
        gravity,
        color: letterColorMap[char] ?? colors.text,
        lockedElement: null,
        alive: true,
        exitPhase: "falling",
        exitTimer: 0,
        glowDecay: 0,
        stuckTimer: 0,
      };

      s.letters.push(letter);
      s.nextSpawnIndex++;
    }

    // ── Physics ──

    function letterAABB(letter: CascadeLetter): { left: number; top: number; right: number; bottom: number } {
      // Approximate bounding box from font size: char width ≈ 0.6 * fontSize, height ≈ 0.75 * fontSize
      const halfW = letter.size * 0.3;
      const halfH = letter.size * 0.375;
      return {
        left: letter.x - halfW,
        top: letter.y - halfH,
        right: letter.x + halfW,
        bottom: letter.y + halfH,
      };
    }

    function elementAABB(row: CascadeRow): { left: number; top: number; right: number; bottom: number } {
      return {
        left: row.left,
        top: row.top,
        right: row.left + row.width,
        bottom: row.top + row.height,
      };
    }

    function aabbOverlap(
      a: { left: number; top: number; right: number; bottom: number },
      b: { left: number; top: number; right: number; bottom: number },
    ): boolean {
      return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
    }

    function updateLetterPhysics(letter: CascadeLetter, dtFactor: number): void {
      letter.vy += letter.gravity * dtFactor;
      if (letter.vy > TERMINAL_VELOCITY) letter.vy = TERMINAL_VELOCITY;
      letter.x += letter.vx;
      letter.y += letter.vy;
      letter.vx *= 0.995;
    }

    // ── Collision detection ──

    // Per-frame lock tracking to enforce exclusive locking
    const frameLockedElements = new Set<HTMLElement>();

    function findCollisionTarget(
      letter: CascadeLetter,
      rows: CascadeRow[],
    ): CascadeRow | null {
      const letterBox = letterAABB(letter);
      let bestRow: CascadeRow | null = null;
      let bestDist = Infinity;

      for (const row of rows) {
        if (row.struck) continue;
        if (frameLockedElements.has(row.el)) continue;

        const rowBox = elementAABB(row);
        if (!aabbOverlap(letterBox, rowBox)) continue;

        // Closest-center-wins: compute distance from letter center to element center
        const rowCx = row.left + row.width / 2;
        const rowCy = row.top + row.height / 2;
        const dx = letter.x - rowCx;
        const dy = letter.y - rowCy;
        const dist = dx * dx + dy * dy;

        if (dist < bestDist) {
          bestDist = dist;
          bestRow = row;
        }
      }

      return bestRow;
    }

    function shouldLetterExit(letter: CascadeLetter, rows: CascadeRow[]): boolean {
      // Scan for any unlocked unstruck element within canvas visible area
      for (const row of rows) {
        if (row.struck) continue;
        if (frameLockedElements.has(row.el)) continue;
        // Check if element is within reasonable range (canvas bounds + margin)
        if (row.top < H + 100 && row.top + row.height > -100) {
          return false;
        }
      }
      return true;
    }

    // ── Phase updates ──

    function updateCascade(dt: number, dtFactor: number): void {
      s.phaseTime += dt;

      // ── Spawn letters at staggered intervals ──
      s.spawnTimer -= dt;
      while (s.spawnTimer <= 0 && s.nextSpawnIndex < SPAWN_SEQUENCE.length) {
        trySpawnLetter();
        s.spawnTimer += randInt(SPAWN_DELAY_MIN, SPAWN_DELAY_MAX);
      }

      // Clear per-frame lock tracking
      frameLockedElements.clear();

      // ── Update each letter ──
      for (const letter of s.letters) {
        if (!letter.alive) continue;

        // Decay impact glow
        if (letter.glowDecay > 0.1) {
          letter.glowDecay *= IMPACT_GLOW_DECAY;
        } else if (letter.glowDecay > 0) {
          letter.glowDecay = 0;
        }

        // Handle locked state (destruction animation playing)
        if (letter.lockedElement !== null) {
          // Physics paused while locked — lock release handled by setTimeout
          continue;
        }

        // Handle exit phase
        if (letter.exitPhase === "exiting") {
          letter.y += letter.vy * dtFactor;
          letter.exitTimer -= dt;
          if (letter.exitTimer <= 0) {
            letter.exitPhase = "gone";
            letter.alive = false;
          }
          continue;
        }

        // ── Physics update ──
        updateLetterPhysics(letter, dtFactor);

        // ── Collision detection ──
        const target = findCollisionTarget(letter, s.rows);
        if (target) {
          // Lock and strike
          letter.lockedElement = target.el;
          target.struck = true;
          frameLockedElements.add(target.el);

          // Bounce
          letter.vy = -(Math.abs(letter.vy) * BOUNCE_RESTITUTION) - 1.5;
          letter.vx += rand(-2, 2);

          // Push above element to prevent re-collision same frame
          letter.y = target.top - 4;

          // Impact effects
          const flashColor = letter.color;
          target.el.style.transition = "none";
          target.el.style.backgroundColor = "rgba(255,255,255,0.85)";
          target.el.style.boxShadow = "0 0 20px rgba(255,255,255,0.6)";

          destroyByType(target.el, letter.x, letter.y);

          requestAnimationFrame(() => {
            target.el.style.transition =
              "background-color 60ms ease-out, box-shadow 60ms ease-out, opacity 180ms ease-out 60ms";
            target.el.style.backgroundColor = "";
            target.el.style.boxShadow = "";
            target.el.style.opacity = "0";
          });

          const dx = rand(-8, 8);
          const dy = rand(-4, 2);
          target.el.style.transform = `translate(${dx}px, ${dy}px)`;
          target.el.style.transition += ", transform 120ms ease-out";

          spawnImpactFragments(letter.x, letter.y, letter.vx, letter.vy, flashColor);

          letter.glowDecay = IMPACT_GLOW_MAX;
          letter.stuckTimer = 0;

          s.shake = Math.max(s.shake, 8);

          // Schedule lock release after destruction animation
          const lockedEl = target.el;
          setTimeout(() => {
            letter.lockedElement = null;
          }, LOCK_RELEASE_MS);
        } else {
          // No target found — increment stuck timer
          letter.stuckTimer += dt;

          // Drift: add small random horizontal velocity to help find targets
          if (letter.stuckTimer > 500) {
            letter.vx += rand(-0.5, 0.5);
          }
        }

        // ── Exit check ──
        if (shouldLetterExit(letter, s.rows)) {
          letter.exitPhase = "exiting";
          letter.vy = EXIT_VELOCITY;
          letter.exitTimer = EXIT_FADE_MS;
        } else if (letter.stuckTimer > STUCK_TIMEOUT_MS) {
          // Force exit if stuck too long
          letter.exitPhase = "exiting";
          letter.vy = EXIT_VELOCITY;
          letter.exitTimer = EXIT_FADE_MS;
        }
      }

      // ── Transition to gather ──
      const allLettersExited = s.letters.length === SPAWN_SEQUENCE.length &&
        s.letters.every((l) => !l.alive);
      const allRowsStruck = s.rows.length > 0 && s.rows.every((r) => r.struck);

      if (!s.gatherStarted && allLettersExited && allRowsStruck) {
        startGather();
      }
      // Fallback: if no rows found, transition after 2s
      if (!s.gatherStarted && s.rows.length === 0 && s.phaseTime > 2000) {
        startGather();
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

    function drawLetters(): void {
      if (s.phase !== "cascade") return;

      for (const letter of s.letters) {
        if (!letter.alive && letter.exitPhase === "gone") continue;

        ctx.save();

        // Exit fade
        if (letter.exitPhase === "exiting") {
          ctx.globalAlpha = Math.max(0, letter.exitTimer / EXIT_FADE_MS);
        }

        // Impact glow
        if (letter.glowDecay > 0.1) {
          ctx.shadowColor = letter.color;
          ctx.shadowBlur = letter.glowDecay;
        }

        ctx.font = `700 ${letter.size}px "Geist", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = letter.color;
        ctx.fillText(letter.char, letter.x, letter.y);
        ctx.restore();
      }
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
      s.nextSpawnIndex = 0;
      s.spawnTimer = INITIAL_SPAWN_DELAY;
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
      drawLetters();
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
