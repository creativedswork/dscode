export type ManagedServiceOwnership = "owned" | "external";

export type ManagedServiceStatus =
  | "checking"
  | "starting"
  | "healthy"
  | "unhealthy"
  | "failed"
  | "stopping"
  | "stopped";

export interface ManagedServiceCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
}

export interface ManagedServiceHealthPolicy {
  readonly probe: (signal: AbortSignal) => Promise<boolean>;
  readonly intervalMs: number;
  readonly timeoutMs: number;
  readonly preflightTimeoutMs?: number;
}

export interface ManagedServiceRestartPolicy {
  readonly maxRapidRestarts: number;
  readonly rapidRestartWindowMs: number;
}

export interface ManagedServiceShutdownPolicy {
  readonly graceMs: number;
}

export interface ManagedServiceSpec {
  readonly id: string;
  readonly command: ManagedServiceCommand;
  readonly health?: ManagedServiceHealthPolicy;
  readonly restart: ManagedServiceRestartPolicy;
  readonly shutdown: ManagedServiceShutdownPolicy;
}

export interface ManagedServiceSnapshot {
  readonly id: string;
  readonly ownership: ManagedServiceOwnership;
  readonly status: ManagedServiceStatus;
  readonly healthy: boolean;
  readonly pid?: number;
  readonly restartCount: number;
}

export interface ManagedServiceHandle {
  readonly id: string;
  readonly ownership: ManagedServiceOwnership;
  readonly status: ManagedServiceStatus;
  readonly healthy: boolean;
  readonly pid?: number;
  snapshot(): ManagedServiceSnapshot;
  stop(): Promise<void>;
}

export interface ManagedServiceController {
  ensure(spec: ManagedServiceSpec, signal?: AbortSignal): Promise<ManagedServiceHandle>;
  shutdown(): Promise<void>;
}
