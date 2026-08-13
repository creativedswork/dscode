import type { Component } from "@earendil-works/pi-tui";

/**
 * Captures input while the owner-bound Permission panel remains rendered
 * inside its Tool timeline.
 */
export class TuiPermissionInput implements Component {
  constructor(private readonly onInput: (data: string) => void) {}

  invalidate(): void {}

  render(): string[] {
    return [""];
  }

  handleInput(data: string): void {
    this.onInput(data);
  }
}
