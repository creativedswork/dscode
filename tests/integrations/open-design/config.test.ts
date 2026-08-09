import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  applyOpenDesignOverride,
  resolveOpenDesignConfig,
} from "../../../src/integrations/open-design/config.js";

describe("Open Design integration config", () => {
  it("field-merges scoped settings and freezes the result", () => {
    const resolution = resolveOpenDesignConfig(
      {
        integrations: {
          openDesign: {
            enabled: true,
            path: "/user/open-design",
            port: 8000,
            autoStart: false,
          },
        },
      },
      {
        integrations: {
          openDesign: {
            path: "/project/open-design",
            autoStart: true,
          },
        },
      },
      {},
    );

    expect(resolution.config).toEqual({
      enabled: true,
      path: "/project/open-design",
      port: 8000,
      autoStart: true,
    });
    expect(Object.isFrozen(resolution.config)).toBe(true);
  });

  it("uses environment values only when typed settings are absent", () => {
    const legacy = resolveOpenDesignConfig({}, {}, {
      OPEN_DESIGN_DIR: "~/open-design",
      OD_PORT: "9000",
    });
    const typed = resolveOpenDesignConfig(
      { integrations: { openDesign: { enabled: false } } },
      {},
      {
        OPEN_DESIGN_DIR: "/legacy/open-design",
        OD_PORT: "9000",
      },
    );

    expect(legacy.config).toEqual({
      enabled: false,
      path: "~/open-design",
      port: 9000,
      autoStart: true,
    });
    expect(legacy.usedLegacyEnvironment).toBe(true);
    expect(legacy.diagnostics.join(" ")).toContain("deprecated");
    expect(typed.config).toEqual({
      enabled: false,
      path: undefined,
      port: 7456,
      autoStart: true,
    });
  });

  it("uses a project .env as a bounded compatibility fallback", () => {
    const root = mkdtempSync(join(tmpdir(), "open-design-config-"));
    const envFile = join(root, ".env");
    writeFileSync(
      envFile,
      "OPEN_DESIGN_DIR=~/Workspace/open-design\nOD_PORT=8123\nIGNORED_SECRET=secret\n",
      "utf8",
    );

    const resolution = resolveOpenDesignConfig({}, {}, {}, envFile);

    expect(resolution.config).toEqual({
      enabled: false,
      path: "~/Workspace/open-design",
      port: 8123,
      autoStart: true,
    });
    expect(resolution.usedLegacyEnvironment).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects unsafe and invalid integration fields", () => {
    const resolution = resolveOpenDesignConfig(
      {},
      {
        integrations: {
          openDesign: {
            enabled: "true",
            path: "",
            port: 0,
            autoStart: "true",
            command: "arbitrary",
          },
        },
      },
      {},
    );

    expect(resolution.config).toEqual({
      enabled: false,
      path: undefined,
      port: 7456,
      autoStart: true,
    });
    expect(resolution.valid).toBe(false);
    expect(resolution.diagnostics.join(" ")).toContain("command is not allowed");
  });

  it("applies a runtime override without mutating persistent config", () => {
    const persistent = Object.freeze({
      enabled: false,
      path: "/open-design",
      port: 7456,
      autoStart: false,
    });

    const overridden = applyOpenDesignOverride(persistent, {
      enabled: true,
      autoStart: true,
    });

    expect(overridden).toEqual({
      enabled: true,
      path: "/open-design",
      port: 7456,
      autoStart: true,
    });
    expect(persistent.enabled).toBe(false);
    expect(Object.isFrozen(overridden)).toBe(true);
  });
});
