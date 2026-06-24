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
  life?: number;
}

export interface Letter {
  char: string;
  color: string;
  glow: number;
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
