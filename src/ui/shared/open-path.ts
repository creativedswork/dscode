import { execFile } from "node:child_process";

export function openPath(path: string): void {
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "linux"
      ? "xdg-open"
      : process.platform === "win32"
        ? "explorer"
        : undefined;
  if (!command) return;
  execFile(command, [path], () => {
    // Opening a generated artifact is best-effort Presentation behavior.
  });
}
