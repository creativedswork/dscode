import type { PlanRecord } from "./types.js";

interface PendingResolver {
  resolve(plan: Readonly<PlanRecord>): void;
  reject(error: Error): void;
}

export class PlannerInteractionBroker {
  private readonly pending = new Map<string, PendingResolver>();

  wait(
    interactionId: string,
    signal?: AbortSignal,
  ): Promise<Readonly<PlanRecord>> {
    if (this.pending.has(interactionId)) {
      throw new Error(`Interaction resolver already exists: ${interactionId}`);
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.pending.delete(interactionId);
        reject(new DOMException("Aborted", "AbortError"));
      };
      this.pending.set(interactionId, {
        resolve: (plan) => {
          signal?.removeEventListener("abort", onAbort);
          this.pending.delete(interactionId);
          resolve(plan);
        },
        reject: (error) => {
          signal?.removeEventListener("abort", onAbort);
          this.pending.delete(interactionId);
          reject(error);
        },
      });
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  resolve(interactionId: string, plan: Readonly<PlanRecord>): boolean {
    const pending = this.pending.get(interactionId);
    if (!pending) return false;
    pending.resolve(plan);
    return true;
  }

  reject(interactionId: string, error: Error): boolean {
    const pending = this.pending.get(interactionId);
    if (!pending) return false;
    pending.reject(error);
    return true;
  }

  has(interactionId: string): boolean {
    return this.pending.has(interactionId);
  }
}
