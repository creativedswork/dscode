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

  constructor(initial: RuntimeConfig) {
    this.current = snapshot(initial);
  }

  get(): RuntimeConfigSnapshot {
    return this.current;
  }

  replace(config: RuntimeConfig): RuntimeConfigSnapshot {
    const next = snapshot(config);
    this.current = next;
    return next;
  }
}
