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
}

export interface ImpactRing {
  x: number;
  y: number;
  r: number;
  life: number;
}
