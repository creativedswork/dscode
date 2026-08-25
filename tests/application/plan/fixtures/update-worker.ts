import { access, writeFile } from "node:fs/promises";

import { PlanStore } from "../../../../src/application/plan/index.js";

const [
  dataDir,
  projectPath,
  planId,
  readyPath,
  startPath,
  nextStatus,
  lockAcquiredPath,
  lockReleasePath,
] = process.argv.slice(2);

if (!dataDir || !projectPath || !planId || !readyPath || !startPath || !nextStatus) {
  throw new Error("Missing PlanStore worker argument");
}
if (nextStatus !== "awaiting_decision" && nextStatus !== "awaiting_approval") {
  throw new Error(`Unsupported worker status: ${nextStatus}`);
}
if ((lockAcquiredPath === undefined) !== (lockReleasePath === undefined)) {
  throw new Error("Lock acquired and release paths must be provided together");
}

await writeFile(readyPath, "ready\n", "utf8");
while (true) {
  try {
    await access(startPath);
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const store = new PlanStore({
  dataDir,
  projectPath,
  retryDelayMs: 1,
  afterOwnerPublish: lockAcquiredPath && lockReleasePath
    ? async () => {
        await writeFile(lockAcquiredPath, "acquired\n", "utf8");
        while (true) {
          try {
            await access(lockReleasePath);
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }
      }
    : undefined,
});
const result = await store.update(planId, 1, (draft) => {
  draft.status = nextStatus;
});
process.stdout.write(`${JSON.stringify(result)}\n`);
