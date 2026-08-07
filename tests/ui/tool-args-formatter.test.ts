import { describe, expect, it } from "vitest";

import { formatToolArgsForDisplay } from "../../src/ui/shared/tool-args-formatter.js";

describe("formatToolArgsForDisplay", () => {
  it("keeps Skill reference reads distinguishable", () => {
    const root = "/workspace/.dscode/skills/xiaohongshu-visual-post";

    expect(formatToolArgsForDisplay("read_file", {
      path: `${root}/references/subagent-orchestration.md`,
    })).toBe(
      'path="xiaohongshu-visual-post/references/subagent-orchestration.md"',
    );
    expect(formatToolArgsForDisplay("read_file", {
      path: `${root}/references/output-contract.md`,
    })).toBe(
      'path="xiaohongshu-visual-post/references/output-contract.md"',
    );
  });

  it("formats Skill activation by name", () => {
    expect(formatToolArgsForDisplay("skill", {
      name: "xiaohongshu-visual-post",
    })).toBe('name="xiaohongshu-visual-post"');
  });

  it("keeps generic arguments bounded", () => {
    expect(formatToolArgsForDisplay("bash", {
      command: "x".repeat(300),
    }, 40)).toHaveLength(40);
  });
});
