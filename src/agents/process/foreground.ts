import type { AgentProcess } from "./types.js";

interface ForegroundLifecycle {
  transition(
    process: AgentProcess,
    state: AgentProcess["state"],
  ): Promise<void>;
}

export interface ForegroundReservation {
  readonly sessionId: string;
  readonly parentAgentId: string;
  readonly childAgentId: string;
}

export class AgentForegroundController {
  private readonly owners = new Map<string, string>();
  private readonly reservations = new Map<string, ForegroundReservation>();

  constructor(
    private readonly requireProcess: (agentId: string) => AgentProcess,
    private readonly lifecycle: ForegroundLifecycle,
  ) {}

  registerMain(process: AgentProcess): void {
    this.owners.set(process.parentSessionId, process.agentId);
  }

  get(sessionId: string): AgentProcess | undefined {
    const agentId = this.owners.get(sessionId);
    return agentId ? this.requireProcess(agentId) : undefined;
  }

  isOwner(process: AgentProcess): boolean {
    return this.owners.get(process.parentSessionId) === process.agentId;
  }

  async reserve(
    parent: AgentProcess,
    childAgentId: string,
  ): Promise<ForegroundReservation> {
    const sessionId = parent.parentSessionId;
    const owner = this.owners.get(sessionId);
    if (owner !== parent.agentId) {
      throw new Error(
        `Agent process ${parent.agentId} does not own Session ${sessionId}`,
      );
    }
    if (this.reservations.has(sessionId)) {
      throw new Error(`Session ${sessionId} already has a foreground reservation`);
    }
    const reservation = {
      sessionId,
      parentAgentId: parent.agentId,
      childAgentId,
    };
    this.reservations.set(sessionId, reservation);
    try {
      if (parent.state === "running") {
        await this.lifecycle.transition(parent, "waiting");
      }
      return reservation;
    } catch (error) {
      this.reservations.delete(sessionId);
      throw error;
    }
  }

  commit(reservation: ForegroundReservation, child: AgentProcess): void {
    this.assertReservation(reservation);
    if (
      child.agentId !== reservation.childAgentId
      || child.parentSessionId !== reservation.sessionId
    ) {
      throw new Error("Foreground reservation does not match child process");
    }
    this.owners.set(reservation.sessionId, child.agentId);
    this.reservations.delete(reservation.sessionId);
  }

  async release(reservation: ForegroundReservation): Promise<void> {
    const current = this.reservations.get(reservation.sessionId);
    if (current !== reservation) return;
    this.reservations.delete(reservation.sessionId);
    const parent = this.requireProcess(reservation.parentAgentId);
    if (parent.state === "waiting") {
      await this.lifecycle.transition(parent, "running");
    }
  }

  async restore(
    currentAgentId: string,
    parentAgentId?: string,
  ): Promise<void> {
    const current = this.requireProcess(currentAgentId);
    const owner = this.owners.get(current.parentSessionId);
    if (owner !== currentAgentId) {
      throw new Error(`Agent process ${currentAgentId} does not own the foreground`);
    }
    const parent = this.requireProcess(
      parentAgentId ?? current.parentAgentId ?? "",
    );
    if (parent.parentSessionId !== current.parentSessionId) {
      throw new Error("Foreground processes must share a parent Session");
    }
    this.owners.set(current.parentSessionId, parent.agentId);
    if (parent.state === "waiting") {
      await this.lifecycle.transition(parent, "running");
    }
  }

  assertRebindAllowed(
    process: AgentProcess,
    nextSessionId: string,
  ): boolean {
    const ownsCurrent = this.isOwner(process);
    if (this.reservations.has(process.parentSessionId)) {
      throw new Error(
        `Session ${process.parentSessionId} has a foreground reservation`,
      );
    }
    const nextOwner = this.owners.get(nextSessionId);
    if (ownsCurrent && nextOwner && nextOwner !== process.agentId) {
      throw new Error(`Session ${nextSessionId} already has foreground owner ${nextOwner}`);
    }
    return ownsCurrent;
  }

  rebind(
    process: AgentProcess,
    previousSessionId: string,
    ownedPreviousSession: boolean,
  ): void {
    if (!ownedPreviousSession) return;
    this.owners.delete(previousSessionId);
    this.owners.set(process.parentSessionId, process.agentId);
  }

  private assertReservation(reservation: ForegroundReservation): void {
    if (this.reservations.get(reservation.sessionId) !== reservation) {
      throw new Error(`Foreground reservation for ${reservation.sessionId} is no longer active`);
    }
  }
}
