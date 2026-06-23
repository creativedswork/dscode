export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  phase: "fall" | "gather" | "formed";
  tx?: number;
  ty?: number;
  gatherDelay?: number;
  flash?: number;
}

export interface Letter {
  char: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
  glow: number;
  hitCount: number;
  alive: boolean;
  column?: number;
  targetEl?: HTMLElement;
  homingEnabled: boolean;
  scaleX: number; // @deprecated inert — no render effect
  scaleY: number; // @deprecated inert — no render effect
  deformTimer: number; // @deprecated inert — no render effect
}

export interface ImpactRing {
  x: number;
  y: number;
  r: number;
  life: number;
}

export interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
  life: number;
  points: { x: number; y: number }[];
}
