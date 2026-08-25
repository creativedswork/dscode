import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { writeJsonAtomically } from "../../../src/application/plan/storage-io.js";

const temporaryDirectories: string[] = [];

function errno(code: string): NodeJS.ErrnoException {
  const error = new Error(`simulated ${code}`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function rejectingDirectorySync(
  platform: NodeJS.Platform,
  code: string,
): Parameters<typeof writeJsonAtomically>[3] {
  return {
    platform,
    openDirectory: async () => ({
      sync: async () => { throw errno(code); },
      close: async () => {},
    }),
  };
}

async function temporaryPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "dscode-plan-storage-"));
  temporaryDirectories.push(directory);
  return join(directory, "plan.json");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("Plan storage I/O", () => {
  it("does not report a committed rename as failed for unsupported Windows directory fsync", async () => {
    const path = await temporaryPath();

    await expect(writeJsonAtomically(
      path,
      { committed: true },
      undefined,
      rejectingDirectorySync("win32", "EPERM"),
    )).resolves.toBeUndefined();

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ committed: true });
  });

  it.each([
    ["non-Windows EPERM", "linux", "EPERM"],
    ["another Windows error", "win32", "EIO"],
  ] as const)("propagates %s after rename", async (_label, platform, code) => {
    const path = await temporaryPath();

    await expect(writeJsonAtomically(
      path,
      { committed: true },
      undefined,
      rejectingDirectorySync(platform, code),
    )).rejects.toMatchObject({ code });

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ committed: true });
  });
});
