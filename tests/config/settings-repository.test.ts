import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  SettingsParseError,
  SettingsRepository,
} from "../../src/config/settings-repository.js";

const roots: string[] = [];

function root(): string {
  const path = mkdtempSync(join(tmpdir(), "dscode-settings-repository-"));
  roots.push(path);
  return path;
}

afterEach(() => {
  for (const path of roots.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("SettingsRepository", () => {
  it("returns distinct user and project scopes for owner-defined precedence", () => {
    const directory = root();
    const userPath = join(directory, "user.json");
    const projectPath = join(directory, "project.json");
    writeFileSync(userPath, JSON.stringify({ model: "user", userOnly: true }));
    writeFileSync(projectPath, JSON.stringify({ model: "project", projectOnly: true }));

    const scopes = new SettingsRepository().readScopes(userPath, projectPath);

    expect({ ...scopes.user, ...scopes.project }).toEqual({
      model: "project",
      userOnly: true,
      projectOnly: true,
    });
    expect(Object.isFrozen(scopes.user)).toBe(true);
    expect(Object.isFrozen(scopes.project)).toBe(true);
  });

  it("patches one field without dropping unrelated settings", async () => {
    const path = join(root(), ".dscode", "settings.json");
    const repository = new SettingsRepository();
    await repository.patchObject(path, {
      skills: ["first"],
      permissions: { deny: ["**/.env"] },
    });
    await repository.patchObject(path, { disabledSkills: ["second"] });

    expect(repository.read(path)).toEqual({
      skills: ["first"],
      permissions: { deny: ["**/.env"] },
      disabledSkills: ["second"],
    });
  });

  it("creates directories and leaves no temporary file after atomic write", async () => {
    const directory = root();
    const path = join(directory, "nested", ".dscode", "settings.json");
    await new SettingsRepository().patchObject(path, { enabled: true });

    expect(existsSync(path)).toBe(true);
    expect(readdirSync(join(directory, "nested", ".dscode"))).toEqual(["settings.json"]);
  });

  it("rejects invalid JSON without overwriting it", async () => {
    const path = join(root(), "settings.json");
    writeFileSync(path, "{ invalid");
    const repository = new SettingsRepository();

    await expect(repository.patchObject(path, { enabled: true }))
      .rejects.toBeInstanceOf(SettingsParseError);
    expect(readFileSync(path, "utf8")).toBe("{ invalid");
  });

  it("serializes concurrent patches against the latest committed document", async () => {
    const path = join(root(), "settings.json");
    const repository = new SettingsRepository();

    await Promise.all([
      repository.patchObject(path, { alpha: 1 }),
      repository.patchObject(path, { beta: 2 }),
      repository.patchObject(path, { gamma: 3 }),
    ]);

    expect(repository.read(path)).toEqual({ alpha: 1, beta: 2, gamma: 3 });
  });

  it("keeps previously returned snapshots structurally unchanged", async () => {
    const path = join(root(), "settings.json");
    const repository = new SettingsRepository();
    const first = await repository.patchObject(path, {
      nested: { value: 1 },
    });
    const second = await repository.patchObject(path, {
      nested: { value: 2 },
    });

    expect(first).toEqual({ nested: { value: 1 } });
    expect(second).toEqual({ nested: { value: 2 } });
    expect(Object.isFrozen((first.nested as object))).toBe(true);
  });
});
