import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PackageResourceProvider } from "../../../src/agents/application/package-resources.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("PackageResourceProvider", () => {
  it("loads package resources by manifest and stable pkg URI", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-resources-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "agents"), { recursive: true });
    const content = "---\nname: vision\n---\nVision";
    await writeFile(join(root, "agents", "vision.md"), content);
    await writeFile(join(root, "manifest.json"), JSON.stringify({
      schemaVersion: 1,
      packageName: "@creative-dswork/dscode",
      packageVersion: "1.2.3",
      entries: {
        "agent:vision": {
          path: "agents/vision.md",
          mediaType: "text/markdown",
          required: true,
          sha256: createHash("sha256").update(content).digest("hex"),
        },
      },
    }));

    const documents = await new PackageResourceProvider(root).load();
    expect(documents).toEqual([{
      source: {
        kind: "bundled",
        path: "pkg:@creative-dswork/dscode@1.2.3/agents/vision.md",
        packageVersion: "1.2.3",
      },
      content,
      packageVersion: "1.2.3",
    }]);
  });

  it("rejects modified package resources", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-resources-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "agents"), { recursive: true });
    await writeFile(join(root, "agents", "vision.md"), "modified");
    await writeFile(join(root, "manifest.json"), JSON.stringify({
      schemaVersion: 1,
      packageName: "pkg",
      packageVersion: "1.0.0",
      entries: {
        "agent:vision": {
          path: "agents/vision.md",
          mediaType: "text/markdown",
          required: true,
          sha256: "0".repeat(64),
        },
      },
    }));

    await expect(new PackageResourceProvider(root).load())
      .rejects.toThrow("integrity check failed");
  });

  it("rejects missing required resources", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-resources-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "manifest.json"), JSON.stringify({
      schemaVersion: 1,
      packageName: "pkg",
      packageVersion: "1.0.0",
      entries: {
        "agent:vision": {
          path: "agents/vision.md",
          mediaType: "text/markdown",
          required: true,
          sha256: "0".repeat(64),
        },
      },
    }));

    await expect(new PackageResourceProvider(root).load())
      .rejects.toThrow("does not exist");
  });
});
