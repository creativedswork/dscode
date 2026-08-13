import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { isCanonicalPathWithin } from "../../src/kernel/path-safety.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("canonical path containment", () => {
  it("accepts local paths and rejects symlink escapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-path-root-"));
    const outside = await mkdtemp(join(tmpdir(), "dscode-path-outside-"));
    temporaryDirectories.push(root, outside);
    await mkdir(join(root, "local"));
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(outside, join(root, "escape"));

    expect(isCanonicalPathWithin(root, join(root, "local", "new.txt")))
      .toBe(true);
    expect(isCanonicalPathWithin(root, join(root, "escape", "secret.txt")))
      .toBe(false);
    expect(isCanonicalPathWithin(root, join(root, "..", "outside.txt")))
      .toBe(false);
  });
});
