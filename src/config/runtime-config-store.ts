import type {
  RuntimeConfig,
  RuntimeConfigSnapshot,
} from "./types.js";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }
  return value;
}

function snapshot(config: RuntimeConfig): RuntimeConfigSnapshot {
  return deepFreeze(structuredClone(config)) as RuntimeConfigSnapshot;
}

export class RuntimeConfigStore {
  private current: RuntimeConfigSnapshot;
  private readonly listeners = new Set<
    (config: RuntimeConfigSnapshot) => void
  >();

  constructor(initial: RuntimeConfig) {
    this.current = snapshot(initial);
  }

  get(): RuntimeConfigSnapshot {
    return this.current;
  }

  replace(
    config: RuntimeConfig,
    notify: boolean = true,
  ): RuntimeConfigSnapshot {
    const next = snapshot(config);
    this.current = next;
    if (notify) this.notify();
    return next;
  }

  notify(): void {
    for (const listener of this.listeners) listener(this.current);
  }

  onChange(listener: (config: RuntimeConfigSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
