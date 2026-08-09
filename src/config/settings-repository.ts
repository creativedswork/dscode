import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

export type JsonRecord = Record<string, unknown>;
export type SettingsPatch = (
  current: Readonly<JsonRecord>,
) => JsonRecord;

export interface ScopedSettings {
  readonly user: Readonly<JsonRecord>;
  readonly project: Readonly<JsonRecord>;
}

export class SettingsParseError extends Error {
  constructor(
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(`Invalid settings JSON: ${path}`, options);
    this.name = "SettingsParseError";
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      freeze(item);
    }
  }
  return value;
}

function assertRecord(value: unknown, path: string): asserts value is JsonRecord {
  if (!isJsonRecord(value)) {
    throw new SettingsParseError(path, {
      cause: new Error("Settings root must be a JSON object"),
    });
  }
}

export function mergeSettingsPatch(
  current: Readonly<JsonRecord>,
  partial: Readonly<JsonRecord>,
): JsonRecord {
  const next = { ...clone(current), ...clone(partial) };
  for (const [key, value] of Object.entries(partial)) {
    if (value === null) delete next[key];
  }
  return next;
}

export class SettingsRepository {
  private readonly queues = new Map<string, Promise<void>>();

  read(path: string): Readonly<JsonRecord> {
    if (!existsSync(path)) return Object.freeze({});
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      assertRecord(parsed, path);
      return freeze(parsed);
    } catch (error) {
      if (error instanceof SettingsParseError) throw error;
      throw new SettingsParseError(path, { cause: error });
    }
  }

  readOrEmpty(path: string): Readonly<JsonRecord> {
    try {
      return this.read(path);
    } catch {
      return Object.freeze({});
    }
  }

  readScopes(userPath: string, projectPath: string): ScopedSettings {
    return Object.freeze({
      user: this.readOrEmpty(userPath),
      project: this.readOrEmpty(projectPath),
    });
  }

  async patch(path: string, update: SettingsPatch): Promise<Readonly<JsonRecord>> {
    const previous = this.queues.get(path) ?? Promise.resolve();
    let release!: () => void;
    const queued = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => queued);
    this.queues.set(path, tail);

    await previous;
    try {
      const current = this.read(path);
      const next = update(freeze(clone(current)));
      assertRecord(next, path);
      this.writeAtomic(path, next);
      return freeze(clone(next));
    } finally {
      release();
      if (this.queues.get(path) === tail) this.queues.delete(path);
    }
  }

  patchObject(
    path: string,
    partial: Readonly<JsonRecord>,
  ): Promise<Readonly<JsonRecord>> {
    return this.patch(path, (current) => mergeSettingsPatch(current, partial));
  }

  /**
   * Transitional synchronous entry for legacy bootstrap helpers.
   * Feature and Presentation code must use typed asynchronous commands.
   */
  patchObjectSync(path: string, partial: Readonly<JsonRecord>): Readonly<JsonRecord> {
    const next = mergeSettingsPatch(this.readOrEmpty(path), partial);
    this.writeAtomic(path, next);
    return freeze(clone(next));
  }

  private writeAtomic(path: string, value: JsonRecord): void {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      renameSync(temporary, path);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
}
