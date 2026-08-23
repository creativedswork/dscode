export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  phase: "fall" | "attract" | "gather" | "formed";
  tx?: number;
  ty?: number;
  orbit?: number;
  gatherDelay?: number;
  flash?: number;
  life?: number;
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

export interface TimestampEntry {
  el: HTMLElement;
  top: number;
  left: number;
  width: number;
  height: number;
  dissolved: boolean;
}

// Tight text-content bounds in client coordinates, derived from Range.getClientRects().
export interface ContentBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
