export type ArchitectureLayer =
  | "bootstrap"
  | "kernel"
  | "application"
  | "feature"
  | "adapter"
  | "persistence"
  | "presentation"
  | "unknown"
  | "external";

export interface ArchitectureViolation {
  key: string;
  rule: string;
  from: string;
  to: string;
  detail: string;
}

export interface ImportMetadata {
  typeOnly?: boolean;
}

export const DESIGNATED_COMPOSITION_ROOTS: ReadonlySet<string>;
export const SOURCE_ROOT_LAYERS: ReadonlyMap<string, ArchitectureLayer>;
export function normalizeSourcePath(path: string): string;
export function classifySource(path: string): ArchitectureLayer;
export function isOwnerContract(path: string): boolean;
export function evaluateSourcePath(path: string): ArchitectureViolation[];
export function evaluateDependency(
  fromPath: string,
  toPath: string,
  importMetadata?: ImportMetadata,
): ArchitectureViolation[];
export function relativeImportTarget(
  fromPath: string,
  specifier: string,
): string | undefined;
