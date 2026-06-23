import { useEffect, useRef } from "react";
import type { Particle, Letter, ImpactRing, Shard } from "../animation/types";

interface TransitionCanvasProps {
  artifactReady: boolean;
  onComplete: () => void;
}

type Phase = "cascade" | "gather" | "formed";

interface AnimationState {
  phase: Phase;
  phaseTime: number;
  colors: ThemeColors;
  letters: Letter[];
  particles: Particle[];
  impactRings: ImpactRing[];
  shards: Shard[];
  shake: number;
  letterTimer: number;
  formedTime: number;
  targetPoints: { x: number; y: number }[];
  particlesAssigned: number;
  gatherStarted: boolean;
  W: number;
  H: number;
  letterColorMap: Record<string, string>;
  struckElements: Set<HTMLElement>;
  letterGlowDecay: Map<string, number>;
  respawnTimer: number;
}

interface ThemeColors {
  accent: string;
  text: string;
  textMuted: string;
}

const LETTER_POOL = ["d", "s", "c", "o"];
const MAX_LETTERS = 4;
const RESPAWN_COOLDOWN_MS = 600;
const MAX_PARTICLES = 2500;
const DPR_CAP = 2;

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

    // ── Size canvas ──
    const container = canvas.parentElement!;
    const W = container.clientWidth;
    const H = container.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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

    // ── Initialize state ──
    const shuffledLetters = [...LETTER_POOL].sort(() => Math.random() - 0.5);

    const s: AnimationState = {
      phase: "cascade",
      phaseTime: 0,
      colors,
      letters: [],
      particles: [],
      impactRings: [],
      shards: [],
      shake: 0,
      letterTimer: 0,
      formedTime: 0,
      targetPoints: [],
      particlesAssigned: 0,
      gatherStarted: false,
      W,
      H,
      letterColorMap,
      struckElements: new Set(),
      letterGlowDecay: new Map(),
      respawnTimer: 0,
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

    function spawnLetter(): void {
      if (s.letters.filter((l) => l.alive).length >= MAX_LETTERS) return;
      const idx = s.letters.length;
      const char = shuffledLetters[idx % shuffledLetters.length];

      // Each letter independently picks a random target from the global unstruck set
      const allTargets = getCollidableElements();
      let targetEl: HTMLElement | undefined;
      if (allTargets.length > 0) {
        targetEl = allTargets[randInt(0, allTargets.length - 1)];
      }

      // Random horizontal spread across the full width so letters fan out
      const margin = 80;
      const letterX = rand(margin, W - margin);

      // Initial horizontal velocity: steer toward target if we have one,
      // otherwise gentle random drift
      let vx: number;
      if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const canvasRect = canvas!.getBoundingClientRect();
        const tCx = rect.left - canvasRect.left + rect.width / 2;
        vx = (tCx - letterX) * 0.025 + rand(-0.8, 0.8);
      } else {
        vx = rand(-1.5, 1.5);
      }

      // Randomised fall depth so letters don't drop in lockstep
      const spawnY = -(rand(140, 260));

      s.letters.push({
        char,
        x: letterX,
        y: spawnY,
        vx,
        vy: rand(3, 6),
        rotation: rand(-0.15, 0.15),
        rotationSpeed: rand(-0.03, 0.03),
        size: rand(28, 48),
        color: letterColorMap[char] ?? colors.text,
        glow: 0,
        hitCount: 0,
        alive: true,
        column: 0,
        targetEl,
        homingEnabled: !!targetEl,
        scaleX: 1,
        scaleY: 1,
        deformTimer: 0,
      });
      s.letterGlowDecay.set(char + idx, 0);
    }

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
        });
      }
    }

    function spawnLetterFragments(l: Letter): void {
      const count = randInt(6, 12);
      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(2, 6);
        s.particles.push({
          x: l.x,
          y: l.y,
          vx: Math.cos(angle) * speed + l.vx * 0.3,
          vy: Math.sin(angle) * speed + l.vy * 0.3,
          size: rand(1, 3),
          color: l.color,
          phase: "fall",
        });
      }
    }

    function findNearestUnstruck(letter: Letter): HTMLElement | null {
      const targets = getCollidableElements();
      if (targets.length === 0) return null;
      const canvasRect = canvas!.getBoundingClientRect();
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const el of targets) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left - canvasRect.left + rect.width / 2;
        const cy = rect.top - canvasRect.top + rect.height / 2;
        const dx = cx - letter.x;
        const dy = cy - letter.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          best = el;
        }
      }
      return best;
    }

    // ── Per-type destruction effects ──

    function destroyTextLine(el: HTMLElement, letter: Letter): void {
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

    function destroyCodeLine(el: HTMLElement, _letter: Letter): void {
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

    function destroyToolCard(el: HTMLElement, letter: Letter): void {
      const canvasRect = canvas!.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const rx = rect.left - canvasRect.left;
      const ry = rect.top - canvasRect.top;
      const impactX = letter.x;
      const impactY = letter.y;

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
        });
      }
    }

    function destroyMessageCard(el: HTMLElement, letter: Letter): void {
      el.style.transition = "opacity 100ms ease-out";
      el.style.opacity = "0.2";
      el.style.backgroundColor = "transparent";

      el.style.transition = "none";
      el.style.backgroundColor = "rgba(255,255,255,0.5)";
      requestAnimationFrame(() => {
        el.style.transition = "background-color 80ms ease-out, opacity 100ms ease-out";
        el.style.backgroundColor = "transparent";
        el.style.opacity = "0.2";
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

    function destroyByType(el: HTMLElement, letter: Letter): void {
      const type = el.getAttribute("data-collider");
      switch (type) {
        case "text-line":
          destroyTextLine(el, letter);
          break;
        case "code-line":
          destroyCodeLine(el, letter);
          break;
        case "tool-card":
          destroyToolCard(el, letter);
          break;
        case "message-card":
          destroyMessageCard(el, letter);
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
      for (const l of s.letters) {
        if (!l.alive) continue;
        l.vy = rand(-12, -8);
        l.vx = rand(-3, 3);
      }
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

    // ── Phase updates ──

    function getCollidableElements(): HTMLElement[] {
      const all = document.querySelectorAll<HTMLElement>("[data-collider]");
      const result: HTMLElement[] = [];
      all.forEach((el) => {
        if (!s.struckElements.has(el)) {
          result.push(el);
        }
      });
      return result;
    }

    // ── Homing: letter actively steers toward its target ──
    function steerTowardTarget(l: Letter): void {
      if (!l.homingEnabled || !l.targetEl) return;

      // If target was already struck, find a new one
      if (s.struckElements.has(l.targetEl)) {
        l.targetEl = findNearestUnstruck(l) ?? undefined;
        if (!l.targetEl) { l.alive = false; return; }
      }

      const tRect = l.targetEl.getBoundingClientRect();
      const canvasRect = canvas!.getBoundingClientRect();
      const tCx = tRect.left - canvasRect.left + tRect.width / 2;
      const tCy = tRect.top - canvasRect.top + tRect.height / 2;
      const tTop = tRect.top - canvasRect.top;

      // Horizontal homing
      const steerX = (tCx - l.x) * 0.035;
      l.vx += steerX;

      // Vertical homing — pull letter toward target centre
      const steerY = (tCy - l.y) * 0.018;
      l.vy += steerY;

      // Approach braking: slow down BEFORE reaching the target
      const approachZone = 80;
      const distToTarget = l.y - tTop;
      if (distToTarget > -approachZone && distToTarget < 0) {
        const brakeFactor = 0.92 + 0.08 * ((-distToTarget) / approachZone);
        l.vy *= brakeFactor;
        l.vx *= 0.96;
      }

      // Clamp speed so letters don't overshoot wildly
      const maxSpeed = 7;
      const speed = Math.sqrt(l.vx * l.vx + l.vy * l.vy);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        l.vx *= scale;
        l.vy *= scale;
      }
    }

    // ── Letter-to-element bounding-box overlap test ──
    function letterOverlapsElement(l: Letter, el: HTMLElement): boolean {
      const rect = el.getBoundingClientRect();
      const canvasRect = canvas!.getBoundingClientRect();
      const erx = rect.left - canvasRect.left;
      const ery = rect.top - canvasRect.top;
      const erw = rect.width;
      const erh = rect.height;

      // Letter visual bounding box — centred on (l.x, l.y)
      const halfSize = l.size * 0.45;
      const ll = l.x - halfSize;
      const lr = l.x + halfSize;
      const lt = l.y - halfSize;
      const lb = l.y + halfSize;

      // AABB overlap
      return !(lr < erx || ll > erx + erw || lb < ery || lt > ery + erh);
    }

    function updateCascade(dt: number, dtFactor: number): void {
      s.phaseTime += dt;
      s.letterTimer += dt;

      const aliveCount = s.letters.filter((l) => l.alive).length;

      if (aliveCount === 0 && s.letters.length > 0 && getCollidableElements().length > 0) {
        if (s.respawnTimer <= 0) s.respawnTimer = RESPAWN_COOLDOWN_MS;
      }
      if (s.respawnTimer > 0) {
        s.respawnTimer -= dt;
        if (s.respawnTimer <= 0) {
          s.letters = [];
          s.letterTimer = 0;
        }
      }

      const canSpawn = s.letters.filter((l) => l.alive).length < MAX_LETTERS;
      if (canSpawn && s.respawnTimer <= 0) {
        const spawnDelay = s.letters.length === 0 ? 200 : rand(400, 800);
        if (s.letterTimer >= spawnDelay) {
          s.letterTimer = 0;
          spawnLetter();
        }
      }

      // Update letters
      for (const l of s.letters) {
        if (!l.alive) continue;
        l.vy += 0.25 * dtFactor;
        if (l.vy > 8) l.vy = 8;
        l.x += l.vx;
        l.y += l.vy;
        l.rotation += l.rotationSpeed;
        // Wall bounds
        if (l.x < 20) { l.x = 20; l.vx = Math.abs(l.vx); }
        if (l.x > W - 20) { l.x = W - 20; l.vx = -Math.abs(l.vx); }
        if (l.y > H + 120) { l.alive = false; continue; }

        // ── Active homing: letter seeks its target with self-awareness ──
        steerTowardTarget(l);

        // Decay glow
        const glowKey = l.char + s.letters.indexOf(l);
        const currentGlow = s.letterGlowDecay.get(glowKey) ?? 0;
        if (currentGlow > 0.1) {
          s.letterGlowDecay.set(glowKey, currentGlow * 0.92);
          l.glow = currentGlow;
        } else if (currentGlow > 0) {
          s.letterGlowDecay.set(glowKey, 0);
          l.glow = 0;
        }

        // Collision detection — AABB letter bbox vs element bbox
        const unstruck = getCollidableElements();
        for (const el of unstruck) {
          if (!letterOverlapsElement(l, el)) continue;

          // Collision!
          l.hitCount++;

          // ── Physics: energy-dependent restitution ──
          const impactSpeed = Math.abs(l.vy);
          const restitution = clamp(0.35 + rand(-0.08, 0.08) + impactSpeed * 0.008, 0.25, 0.6);
          l.vy = -(impactSpeed * restitution);
          l.vx = l.vx * 0.6 + rand(-2.5, 2.5);

          const glowKey = l.char + s.letters.indexOf(l);
          s.letterGlowDecay.set(glowKey, 20);
          l.glow = 20;

          // Determine what to strike — prefer specific child of message-card
          let strikeTarget: HTMLElement = el;
          let shouldStrike = true;
          if (el.getAttribute("data-collider") === "message-card") {
            const children = el.querySelectorAll<HTMLElement>("[data-collider]");
            if (children.length > 0) {
              let childHit: HTMLElement | null = null;
              children.forEach((child) => {
                if (letterOverlapsElement(l, child)) {
                  if (!s.struckElements.has(child)) {
                    childHit = child;
                  }
                }
              });
              if (childHit) {
                strikeTarget = childHit;
              } else {
                shouldStrike = false;
              }
            }
          }
          if (shouldStrike) {
            // ── Element flash ──
            strikeTarget.style.transition = "none";
            strikeTarget.style.backgroundColor = "rgba(255,255,255,0.85)";
            strikeTarget.style.boxShadow = "0 0 20px rgba(255,255,255,0.6)";
            requestAnimationFrame(() => {
              strikeTarget.style.transition = "background-color 60ms ease-out, box-shadow 60ms ease-out, opacity 180ms ease-out 60ms";
              strikeTarget.style.backgroundColor = "";
              strikeTarget.style.boxShadow = "";
              strikeTarget.style.opacity = "0";
            });

            // ── Element displacement ──
            const dx = rand(-8, 8);
            const dy = rand(-4, 2);
            strikeTarget.style.transform = `translate(${dx}px, ${dy}px)`;
            strikeTarget.style.transition += ", transform 120ms ease-out";

            s.struckElements.add(strikeTarget);

            // ── Per-type destruction ──
            destroyByType(strikeTarget, l);

            // ── Letter fragment particles ──
            spawnLetterFragments(l);
          }
          // ── Shake scaling with impact speed ──
          s.shake = Math.max(s.shake, Math.min(impactSpeed * 1.5, 10));
          if (shouldStrike) break;
        }
      }

      // Update particles during cascade phase
      for (const p of s.particles) {
        if (p.phase !== "fall") continue;
        p.vy += 0.28 * dtFactor;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.995;
        if (p.y > H - 4) { p.y = H - 4; p.vy *= -0.3; p.vx *= 0.75; }
      }

      // Update shards
      for (const sh of s.shards) {
        sh.x += sh.vx;
        sh.y += sh.vy;
        sh.vy += 0.15 * dtFactor;
        sh.rotation += sh.rotationSpeed;
        sh.life -= dt;
      }
      s.shards = s.shards.filter((sh) => sh.life > 0);

      // Transition to gather: only natural completion (all struck)
      if (!s.gatherStarted) {
        const remaining = document.querySelectorAll<HTMLElement>("[data-collider]");
        let allStruck = true;
        remaining.forEach((el) => {
          if (!s.struckElements.has(el)) { allStruck = false; }
        });
        const totalHits = s.letters.reduce((sum, l) => sum + l.hitCount, 0);
        const minRequired = Math.min(3, Math.max(1, Math.floor(remaining.length / 2)));

        if (allStruck && totalHits >= minRequired) {
          startGather();
        }
      }
    }

    function updateGather(dt: number, dtFactor: number): void {
      s.phaseTime += dt;

      for (const l of s.letters) {
        if (!l.alive) continue;
        l.y += l.vy;
        l.x += l.vx;
        if (l.y < -200) l.alive = false;
      }

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
      for (const l of s.letters) {
        if (!l.alive) continue;
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.rotation);
        ctx.font = `700 ${l.size}px "Geist", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (l.glow > 0) {
          ctx.shadowColor = l.color;
          ctx.shadowBlur = l.glow;
        }
        ctx.fillStyle = l.color;
        ctx.fillText(l.char, 0, 0);
        ctx.restore();
      }
    }

    function drawParticles(): void {
      for (const p of s.particles) {
        const size = p.phase === "formed" ? p.size * (1 + (p.flash ?? 0) * 3) : p.size;
        if (p.phase === "formed" && (p.flash ?? 0) > 0.3) {
          ctx.globalCompositeOperation = "lighter";
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
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

      drawFormedGlow(now);
      drawLetters();
      drawParticles();
      drawRings();
      drawShards();

      ctx.restore();
      drawHUD();

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

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
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 50,
        background: "transparent",
        pointerEvents: "none",
      }}
    />
  );
}
