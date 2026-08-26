import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PlanStore } from "../../../src/application/plan/index.js";
import { makePlanInput } from "./helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("Planner project binding", () => {
  it("keeps existing stores bound to their original project", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-planner-project-"));
    roots.push(root);
    const store = new PlanStore({
      dataDir: root,
      projectPath: "/project-a",
    });
    const firstDirectory = store.directoryPath;
    const first = await store.create(makePlanInput("shared-plan"));
    if (!first.ok) throw new Error("first create failed");

    const nextStore = new PlanStore({
      dataDir: root,
      projectPath: "/project-b",
    });
    const second = await nextStore.create(makePlanInput("shared-plan"));

    expect(second.ok).toBe(true);
    expect(store.directoryPath).toBe(firstDirectory);
    expect(nextStore.directoryPath).not.toBe(firstDirectory);
    expect(second.ok && second.plan.projectKey).toBe(nextStore.projectKey);
    const old = await store.load("shared-plan");
    expect(old.ok && old.plan?.projectKey).toBe(store.projectKey);
  });
});
