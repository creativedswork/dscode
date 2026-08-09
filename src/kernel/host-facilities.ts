export interface HostFacilities {
  get<T>(key: symbol): T | undefined;
}

export class HostFacilityRegistry implements HostFacilities {
  private readonly facilities = new Map<symbol, unknown>();

  register<T>(key: symbol, facility: T): this {
    if (this.facilities.has(key)) {
      throw new Error("Host facility is already registered");
    }
    this.facilities.set(key, facility);
    return this;
  }

  get<T>(key: symbol): T | undefined {
    return this.facilities.get(key) as T | undefined;
  }

  clear(): void {
    this.facilities.clear();
  }
}
