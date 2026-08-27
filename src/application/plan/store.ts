import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  findCommandReplay,
  validateCommandInteraction,
} from "./command.js";
import { computePlanDigest, digestCanonicalPayload } from "./digest.js";
import { acquirePlanLock } from "./lock.js";
import type { PlanLockOptions } from "./lock.js";
import { assertPlanId, resolvePlanProjectLocation } from "./path.js";
import { PlanValidationError, validatePlanRecord } from "./schema.js";
import { quarantineFile, writeJsonAtomically } from "./storage-io.js";
import {
  isSameCancellation,
  preparePlanMutation,
  type PlanUpdateOptions,
} from "./store-mutation.js";
import type {
  NewPlanInteraction,
  NewPlanRecord,
  PlanCommand,
  PlanCommandMutationResult,
  PlanConflict,
  PlanLoadResult,
  PlanMutationObserver,
  PlanStoreMutationResult,
} from "./store-types.js";
import type { PlanCommandReceipt, PlanRecord } from "./types.js";
export interface PlanStoreOptions extends PlanLockOptions {
  dataDir: string;
  projectPath: string;
}
export type PlanRecordUpdater = (draft: PlanRecord) => void;
export type { PlanUpdateOptions } from "./store-mutation.js";
export class PlanNotFoundError extends Error {
  constructor(planId: string) {
    super(`Plan not found: ${planId}`);
    this.name = "PlanNotFoundError";
  }
}
function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === code;
}
export class PlanStore {
  readonly directoryPath: string;
  readonly projectKey: string;
  readonly projectPath: string;
  private readonly queues = new Map<string, Promise<void>>();
  private readonly lockOptions: PlanLockOptions;
  private readonly now: () => number;
  private mutationObserver?: PlanMutationObserver;
  constructor(options: PlanStoreOptions) {
    const location = resolvePlanProjectLocation(options.dataDir, options.projectPath);
    this.directoryPath = location.directory;
    this.projectKey = location.projectKey;
    this.projectPath = options.projectPath;
    this.now = options.now ?? Date.now;
    this.lockOptions = options;
  }
  bindMutationObserver(observer: PlanMutationObserver): void {
    this.mutationObserver = observer;
  }
  planPath(planId: string): string {
    assertPlanId(planId);
    return join(this.directoryPath, `${planId}.json`);
  }
  async create(input: NewPlanRecord): Promise<PlanStoreMutationResult> {
    assertPlanId(input.planId);
    return this.enqueue(input.planId, async () => this.withLock(input.planId, async () => {
      const current = await this.readCurrent(input.planId);
      if (current) return this.conflict(0, current);
      const now = this.now();
      const plan = {
        ...structuredClone(input),
        schemaVersion: 1,
        projectKey: this.projectKey,
        version: 1,
        revision: 1,
        digest: "",
        commandReceipts: [],
        createdAt: now,
        updatedAt: now,
      } satisfies PlanRecord;
      plan.digest = computePlanDigest(plan);
      validatePlanRecord(plan);
      await writeJsonAtomically(this.planPath(plan.planId), plan);
      this.mutationObserver?.committed(plan);
      return { ok: true, plan };
    }));
  }
  async load(planId: string): Promise<PlanLoadResult> {
    assertPlanId(planId);
    try {
      return { ok: true, plan: await this.readCurrent(planId) };
    } catch (error) {
      if (!(error instanceof PlanValidationError)) throw error;
      return this.enqueue(planId, async () => this.withLock(planId, async () => {
        try {
          return { ok: true, plan: await this.readCurrent(planId) };
        } catch (lockedError) {
          if (!(lockedError instanceof PlanValidationError)) throw lockedError;
          const quarantinePath = await quarantineFile(
            this.planPath(planId),
            planId,
            this.now(),
          );
          return {
            ok: false,
            reason: "corrupt",
            quarantinePath,
            message: lockedError.message,
          };
        }
      }));
    }
  }
  async update(
    planId: string,
    expectedVersion: number,
    updater: PlanRecordUpdater,
    options: PlanUpdateOptions = {},
  ): Promise<PlanStoreMutationResult> {
    assertPlanId(planId);
    return this.enqueue(planId, async () => this.withLock(planId, async () => {
      const current = await this.requireCurrent(planId);
      const accepted = options.cancellation;
      if (current.version !== expectedVersion
        && (!accepted || !isSameCancellation(current.cancellation, accepted))) {
        return this.conflict(expectedVersion, current);
      }
      const draft = structuredClone(current);
      updater(draft);
      const next = preparePlanMutation(current, draft, this.now(), options);
      await writeJsonAtomically(this.planPath(planId), next);
      this.mutationObserver?.committed(next, current);
      return { ok: true, plan: next };
    }));
  }
  async persistInteraction(
    planId: string,
    expectedVersion: number,
    interaction: NewPlanInteraction,
    updater?: PlanRecordUpdater,
  ): Promise<PlanStoreMutationResult> {
    return this.update(planId, expectedVersion, (draft) => {
      if (draft.pendingInteraction) {
        throw new PlanValidationError(
          `Interaction ${draft.pendingInteraction.interactionId} is already pending`,
        );
      }
      if (draft.commandReceipts.some(
        (receipt) => receipt.interactionId === interaction.interactionId,
      )) {
        throw new PlanValidationError(
          `Interaction ${interaction.interactionId} was already consumed`,
        );
      }
      draft.pendingInteraction = {
        ...structuredClone(interaction),
        revision: draft.revision,
        planDigest: draft.digest,
        payloadDigest: digestCanonicalPayload(interaction.payload),
        state: "pending",
      } as PlanRecord["pendingInteraction"];
      updater?.(draft);
    });
  }
  async applyCommand(
    command: PlanCommand,
    updater: PlanRecordUpdater,
  ): Promise<PlanCommandMutationResult> {
    assertPlanId(command.planId);
    return this.enqueue(command.planId, async () =>
      this.withLock(command.planId, async () => {
        const current = await this.requireCurrent(command.planId);
        const payloadDigest = digestCanonicalPayload({
          operation: command.operation,
          interactionId: command.interactionId ?? null,
          interactionPayloadDigest: command.interactionPayloadDigest ?? null,
          payload: command.payload,
        });
        const priorOutcome = findCommandReplay(command, current, payloadDigest);
        if (priorOutcome) return priorOutcome;
        if (current.version !== command.expectedVersion) {
          return this.conflict(command.expectedVersion, current);
        }
        const draft = structuredClone(current);
        updater(draft);
        if (command.interactionId) draft.pendingInteraction = undefined;
        const interactionOutcome = validateCommandInteraction(command, current);
        if (interactionOutcome) return interactionOutcome;
        const next = preparePlanMutation(current, draft, this.now());
        const receipt: PlanCommandReceipt = {
          commandId: command.commandId,
          operation: command.operation,
          interactionId: command.interactionId,
          payloadDigest,
          result: command.interactionId
            ? { kind: "interaction_consumed", interactionId: command.interactionId }
            : { kind: "mutation_applied", operation: command.operation },
          resultingVersion: next.version,
          completedAt: this.now(),
        };
        next.commandReceipts = [...current.commandReceipts, receipt];
        validatePlanRecord(next);
        await writeJsonAtomically(this.planPath(command.planId), next);
        this.mutationObserver?.committed(next, current);
        return { ok: true, plan: next, receipt, duplicate: false };
      })
    );
  }
  private conflict(
    expectedVersion: number,
    current: PlanRecord,
  ): Extract<PlanStoreMutationResult, { ok: false }> {
    const conflict: PlanConflict = {
      kind: "version",
      expectedVersion,
      currentVersion: current.version,
      current,
    };
    this.mutationObserver?.conflicted(conflict);
    return {
      ok: false,
      reason: "conflict",
      conflict,
    };
  }

  private async readCurrent(planId: string): Promise<PlanRecord | undefined> {
    let text: string;
    try {
      text = await readFile(this.planPath(planId), "utf8");
    } catch (error) {
      if (isErrno(error, "ENOENT")) return undefined;
      throw error;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new PlanValidationError(`Plan ${planId} contains invalid JSON`);
    }
    const plan = validatePlanRecord(raw);
    if (plan.planId !== planId || plan.projectKey !== this.projectKey) {
      throw new PlanValidationError(`Plan ${planId} does not match its storage location`);
    }
    if (computePlanDigest(plan) !== plan.digest) {
      throw new PlanValidationError(`Plan ${planId} has an invalid semantic digest`);
    }
    return plan;
  }
  private async requireCurrent(planId: string): Promise<PlanRecord> {
    const current = await this.readCurrent(planId);
    if (!current) throw new PlanNotFoundError(planId);
    return current;
  }
  private async withLock<T>(planId: string, operation: () => Promise<T>): Promise<T> {
    await mkdir(this.directoryPath, { recursive: true });
    const release = await acquirePlanLock(this.directoryPath, planId, this.lockOptions);
    try {
      return await operation();
    } finally {
      await release();
    }
  }
  private enqueue<T>(planId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(planId) ?? Promise.resolve();
    const result = previous.catch(() => {}).then(operation);
    const settled = result.then(() => undefined, () => undefined);
    this.queues.set(planId, settled);
    void settled.finally(() => {
      if (this.queues.get(planId) === settled) this.queues.delete(planId);
    });
    return result;
  }
}
