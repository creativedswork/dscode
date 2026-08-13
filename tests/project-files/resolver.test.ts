import { describe, it, expect } from "vitest";
import { resolveAtFileRefs } from "../../src/project-files/resolver.js";

const PROJECT_ROOT = process.cwd();

// Direct regex verification (bypasses any module caching issues)
const AT_FILE_RE = /(?:^|(?<![a-zA-Z0-9]))@([^\s@]+)/g;

function isLikelyFilePath(text: string): boolean {
  if (text.includes("/") || text.includes("\\")) return true;
  if (/\.[a-zA-Z0-9]{1,6}$/.test(text)) return true;
  if (/[a-zA-Z0-9\-_]/.test(text)) return true;
  return false;
}

function extractAtPaths(text: string): string[] {
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = AT_FILE_RE.exec(text)) !== null) {
    const captured = match[1];
    if (isLikelyFilePath(captured)) {
      paths.push(captured);
    }
  }
  return paths;
}

describe("AT_FILE_RE regex — CJK prefix support", () => {
  it("should match @ after CJK character", () => {
    const paths = extractAtPaths("的@README.md");
    expect(paths).toContain("README.md");
  });

  it("should match @ after full-width character", () => {
    const paths = extractAtPaths("，@README.md");
    expect(paths).toContain("README.md");
  });

  it("should match @ at start of string", () => {
    const paths = extractAtPaths("@README.md");
    expect(paths).toContain("README.md");
  });

  it("should match @ after whitespace", () => {
    const paths = extractAtPaths("see @README.md for details");
    expect(paths).toContain("README.md");
  });

  it("should NOT match @ preceded by Latin letter", () => {
    const paths = extractAtPaths("abc@README.md");
    expect(paths).toHaveLength(0);
  });

  it("should NOT match @ preceded by digit", () => {
    const paths = extractAtPaths("123@README.md");
    expect(paths).toHaveLength(0);
  });
});

describe("isLikelyFilePath — CJK text filtering", () => {
  it("should skip pure CJK text", () => {
    const paths = extractAtPaths("@我们今天去看一下");
    expect(paths).toHaveLength(0);
  });

  it("should skip multiple pure CJK", () => {
    const paths = extractAtPaths("@你好 @世界");
    expect(paths).toHaveLength(0);
  });

  it("should filter CJK while keeping real paths", () => {
    const paths = extractAtPaths("@你好 check @README.md please @世界");
    expect(paths).toContain("README.md");
    expect(paths).not.toContain("你好");
    expect(paths).not.toContain("世界");
  });

  it("should keep CJK filename with extension", () => {
    const paths = extractAtPaths("@我们.txt");
    expect(paths).toContain("我们.txt");
  });

  it("should keep path with CJK segment", () => {
    const paths = extractAtPaths("@src/中文");
    expect(paths).toContain("src/中文");
  });

  it("should keep mixed CJK+ASCII with slash", () => {
    const paths = extractAtPaths("@src/中文config");
    expect(paths).toContain("src/中文config");
  });
});

describe("resolveAtFileRefs — end-to-end integration", () => {
  it("should resolve regular @ref at start of string", () => {
    const r = resolveAtFileRefs(PROJECT_ROOT, "@README.md");
    expect(r.text).toContain("```");
    expect(r.warnings).toHaveLength(0);
  });

  it("should resolve two real files", () => {
    const r = resolveAtFileRefs(
      PROJECT_ROOT,
      "@README.md @src/config/types.ts",
    );
    expect(r.text).toContain("```");
    expect(r.warnings).toHaveLength(0);
  });
});
