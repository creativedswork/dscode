export type ArchitectureLayer =
  | "bootstrap"
  | "kernel"
  | "application"
  | "feature"
  | "adapter"
  | "persistence"
  | "presentation"
  | "external";

export interface ArchitectureViolation {
  key: string;
  rule: string;
  from: string;
  to: string;
  detail: string;
}

export const DESIGNATED_COMPOSITION_ROOTS: ReadonlySet<string>;
export function normalizeSourcePath(path: string): string;
export function classifySource(path: string): ArchitectureLayer;
export function isOwnerContract(path: string): boolean;
export function evaluateDependency(
  fromPath: string,
  toPath: string,
): ArchitectureViolation[];
export function relativeImportTarget(
  fromPath: string,
  specifier: string,
): string | undefined;
