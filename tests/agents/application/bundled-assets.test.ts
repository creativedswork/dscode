import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Bundled Agent Application packaging", () => {
  it("ships CHIEF workers and vision with build validation", async () => {
    const root = process.cwd();
    const directory = join(root, "resources", "agents");
    const files = (await readdir(directory)).filter((name) => name.endsWith(".md"));
    expect(files.sort()).toEqual([
      "chief-attribution.md",
      "chief-backtrack.md",
      "chief-graph.md",
      "chief-oracle.md",
      "eval-rule-attribution.md",
      "eval-rule-merge.md",
      "vision.md",
    ]);
    for (const name of files.filter((name) => name !== "vision.md")) {
      const content = await readFile(join(directory, name), "utf8");
      expect(content).toContain(`name: ${name.slice(0, -3)}`);
      expect(content).toContain("permissionMode: plan");
      expect(content.split("---").at(-1)?.trim().length).toBeGreaterThan(0);
    }
    const content = await readFile(join(directory, "vision.md"), "utf8");
    expect(content).toContain("name: vision");
    expect(content).toContain("model: vision");
    expect(content).toContain("handler: ocr");
    expect(content.split("---").at(-1)?.trim().length).toBeGreaterThan(0);
    const build = await readFile(join(root, "scripts", "build.mjs"), "utf8");
    expect(build).toContain("buildResources");
    expect(build).toContain('"dist", "resources"');
  });

  it("keeps the Vision role prompt out of TypeScript implementation files", async () => {
    const root = process.cwd();
    const visionClient = await readFile(
      join(root, "src", "drivers", "vision", "client.ts"),
      "utf8",
    );

    expect(visionClient).not.toContain("You are an image description assistant");
    expect(visionClient).not.toContain("请详细描述这张图片");
  });
});
