import { useEffect, useRef } from "react";
import type { Particle, Letter, ImpactRing } from "../animation/types";

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
  cascadeStuckTimer: number;
}

interface ThemeColors {
  accent: string;
  text: string;
  textMuted: string;
}

const LETTER_POOL = ["d", "s", "c", "o"];
const MAX_LETTERS = 4;
const CASCADE_TIMEOUT_MS = 15000;
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
    const columnWidth = W / 4;

    const s: AnimationState = {
      phase: "cascade",
      phaseTime: 0,
      colors,
      letters: [],
      particles: [],
      impactRings: [],
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
      cascadeStuckTimer: 0,
    };
    stateRef.current = s;

    // ── Spawn & particle helpers ──

    function spawnLetter(): void {
      if (s.letters.filter((l) => l.alive).length >= MAX_LETTERS) return;
      const idx = s.letters.length; // Use spawn order
      const char = shuffledLetters[idx % shuffledLetters.length];
      const column = idx % 4;
      const colX = column * columnWidth + columnWidth / 2;

      // Target unstruck colliders with expanding column search for higher hit probability
      let letterX: number;
      const unstruck = getCollidableElements();
      const canvasRect = canvas!.getBoundingClientRect();

      function candidatesInCol(col: number): HTMLElement[] {
        const cLeft = col * columnWidth;
        const cRight = (col + 1) * columnWidth;
        return unstruck.filter((el) => {
          const rect = el.getBoundingClientRect();
          const rx = rect.left - canvasRect.left;
          return rx + rect.width > cLeft && rx < cRight;
        });
      }

      // Expand search outward from assigned column
      let candidates: HTMLElement[] = [];
      for (let d = 0; d < 4; d++) {
        const colLeft2 = ((column - d) % 4 + 4) % 4;
        const colRight2 = (column + d) % 4;
        if (d === 0) {
          candidates = candidatesInCol(column);
        } else {
          candidates = [...candidatesInCol(colLeft2), ...candidatesInCol(colRight2)];
        }
        if (candidates.length > 0) break;
      }

      if (candidates.length > 0) {
        const target = candidates[randInt(0, candidates.length - 1)];
        const rect = target.getBoundingClientRect();
        const rx = rect.left - canvasRect.left;
        letterX = rand(rx, rx + rect.width);
      } else {
        letterX = colX + rand(-columnWidth * 0.4, columnWidth * 0.4);
      }

      s.letters.push({
        char,
        x: letterX,
        y: rand(-120, -20),
        vx: rand(-0.8, 0.8),
        vy: rand(3, 6),
        rotation: rand(-0.15, 0.15),
        rotationSpeed: rand(-0.03, 0.03),
        size: rand(28, 48),
        color: letterColorMap[char] ?? colors.text,
        glow: 0,
        hitCount: 0,
        alive: true,
        column,
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

    function startGather(): void {
      if (s.gatherStarted) return;
      s.gatherStarted = true;
      s.phase = "gather";
      s.phaseTime = 0;
      // Letters fly up and exit (do NOT convert to particles)
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
      // Set all particle colors to text color for unified wordmark
      for (const p of s.particles) {
        p.color = colors.text;
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

    function updateCascade(dt: number, dtFactor: number): void {
      s.phaseTime += dt;
      s.letterTimer += dt;

      // Spawn letters at staggered intervals (with re-spawn when all letters die)
      const aliveCount = s.letters.filter((l) => l.alive).length;

      // When all letters die but unstruck elements remain, start respawn cooldown
      if (aliveCount === 0 && s.letters.length > 0 && getCollidableElements().length > 0) {
        if (s.respawnTimer <= 0) s.respawnTimer = RESPAWN_COOLDOWN_MS;
      }
      if (s.respawnTimer > 0) {
        s.respawnTimer -= dt;
        if (s.respawnTimer <= 0) {
          // Clear dead letters to enable fresh spawns
          s.letters = [];
          s.letterTimer = 0;
        }
      }

      // Spawn new letters while under max alive count
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
        if (l.vy > 8) l.vy = 8; // terminal velocity
        l.x += l.vx;
        l.y += l.vy;
        l.rotation += l.rotationSpeed;
        // Wall bounds
        if (l.x < 20) { l.x = 20; l.vx = Math.abs(l.vx); }
        if (l.x > W - 20) { l.x = W - 20; l.vx = -Math.abs(l.vx); }
        if (l.y > H + 120) { l.alive = false; continue; }

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

        // Collision detection
        const unstruck = getCollidableElements();
        for (const el of unstruck) {
          const rect = el.getBoundingClientRect();
          const canvasRect = canvas!.getBoundingClientRect();
          const rx = rect.left - canvasRect.left;
          const ry = rect.top - canvasRect.top;
          const rw = rect.width;
          const rh = rect.height;
          const margin = 6;
          if (
            l.x > rx - margin &&
            l.x < rx + rw + margin &&
            l.y > ry - margin &&
            l.y < ry + rh + margin
          ) {
            // Collision!
            l.hitCount++;
            l.vy = -Math.abs(l.vy) * 0.3 - 1.5;
            l.vx += rand(-1.5, 1.5);
            l.y = ry - 8; // Reposition 8px above element
            const glowKey = l.char + s.letters.indexOf(l);
            s.letterGlowDecay.set(glowKey, 20);
            l.glow = 20;

            // Strike the element
            el.style.transition = "opacity 150ms ease-out";
            el.style.opacity = "0";
            s.struckElements.add(el);
            spawnParticles(el);
            // If striking a message card, also strike all child colliders
            if (el.getAttribute("data-collider") === "message-card") {
              const children = el.querySelectorAll<HTMLElement>("[data-collider]");
              children.forEach((child) => {
                if (!s.struckElements.has(child)) {
                  child.style.transition = "opacity 150ms ease-out";
                  child.style.opacity = "0";
                  s.struckElements.add(child);
                  spawnParticles(child);
                }
              });
            }
            s.shake = Math.max(s.shake, 5);
            s.cascadeStuckTimer = 0; // Reset stuck timer on hit
            break;
          }
        }
      }

      // Track cascade stuck state (no collisions happening)
      s.cascadeStuckTimer += dt;

      // Update particles during cascade phase (gravity, friction, floor bounce)
      for (const p of s.particles) {
        if (p.phase !== "fall") continue;
        p.vy += 0.28 * dtFactor;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.995;
        if (p.y > H - 4) { p.y = H - 4; p.vy *= -0.3; p.vx *= 0.75; }
      }

      // Check transition to gather: all struck OR safety timeout
      if (!s.gatherStarted) {
        const remaining = document.querySelectorAll<HTMLElement>("[data-collider]");
        let allStruck = true;
        let unstruckCount = 0;
        remaining.forEach((el) => {
          if (!s.struckElements.has(el)) { allStruck = false; unstruckCount++; }
        });
        const totalHits = s.letters.reduce((sum, l) => sum + l.hitCount, 0);
        const minRequired = Math.min(3, Math.max(1, Math.floor(remaining.length / 2)));

        // Condition 1: all struck with minimum hits (natural completion)
        const naturalComplete = allStruck && totalHits >= minRequired;

        // Condition 2: safety timeout — cascade ran too long or is stuck
        const timedOut = s.phaseTime > CASCADE_TIMEOUT_MS;
        const stuck = (unstruckCount > 0 && s.cascadeStuckTimer > 5000 && s.letters.filter((l) => l.alive).length === 0 && s.respawnTimer > 0);

        if (naturalComplete || timedOut || stuck) {
          // Force-strike any remaining unstruck elements on timeout
          if (!naturalComplete && (timedOut || stuck)) {
            remaining.forEach((el) => {
              if (!s.struckElements.has(el)) {
                el.style.transition = "opacity 150ms ease-out";
                el.style.opacity = "0";
                s.struckElements.add(el);
                spawnParticles(el);
              }
            });
          }
          startGather();
        }
      }
    }

    function updateGather(dt: number, dtFactor: number): void {
      s.phaseTime += dt;

      // Remove letters (fly off)
      for (const l of s.letters) {
        if (!l.alive) continue;
        l.y += l.vy;
        l.x += l.vx;
        if (l.y < -200) l.alive = false;
      }

      // Spawn filler particles
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

      // Update particles
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
              p.color = colors.text;
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
            p.color = colors.text;
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

      // Update rings
      for (const ring of s.impactRings) { ring.r += 2.2; ring.life -= 0.045; }
      s.impactRings = s.impactRings.filter((r) => r.life > 0);

      // Transition to formed
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
      // After 600ms settle AND dashboard ready, call onComplete exactly once
      if (s.formedTime > 600 && artifactReadyRef.current && !onCompleteCalledRef.current) {
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
      const dtFactor = dt / 16.667; // Normalize to ~60fps

      // Clear canvas completely (transparent overlay)
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

      ctx.restore();
      drawHUD();

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
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
