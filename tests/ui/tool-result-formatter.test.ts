import { describe, it, expect } from "vitest";
import { formatToolResultForUI } from "../../src/ui/shared/tool-result-formatter.js";

describe("formatToolResultForUI", () => {
  it("returns empty string for empty input", () => {
    expect(formatToolResultForUI("bash", "")).toBe("");
  });

  // ── write_file / overwrite_file ──

  it("extracts summary for write_file with anchor preview", () => {
    const input = [
      "Written 23577 bytes to /path/index.html",
      "New file version: fv_2a818c68",
      "--- BEGIN ANCHOR PREVIEW ---",
      "  1#bb7258 [high]|/**",
      "  2#d4995d [high]| * Single choke-point",
      "  3#c4c9bd [high]| */",
      "",
    ].join("\n");
    const result = formatToolResultForUI("write_file", input);
    expect(result).toContain("Written 23577 bytes to /path/index.html");
    expect(result).toContain("New file version: fv_2a818c68");
    expect(result).toContain("anchor preview hidden");
    expect(result).not.toContain("bb7258");
  });

  it("extracts summary for overwrite_file", () => {
    const input = [
      "Written 500 bytes to /path/file.ts",
      "New file version: fv_abc12345",
    ].join("\n");
    const result = formatToolResultForUI("overwrite_file", input);
    expect(result).toContain("Written 500 bytes to /path/file.ts");
    expect(result).toContain("New file version: fv_abc12345");
    // No extra lines → no anchor hint
    expect(result).not.toContain("anchor preview");
  });

  it("handles write_file with only one line", () => {
    const result = formatToolResultForUI("write_file", "Written 100 bytes to /x.ts");
    expect(result).toBe("Written 100 bytes to /x.ts");
  });

  it("handles write_file with leading blank lines", () => {
    const input = [
      "",
      "",
      "Written 800 bytes to /path/foo.ts",
      "New file version: fv_xyz999",
    ].join("\n");
    const result = formatToolResultForUI("write_file", input);
    expect(result).toContain("Written 800 bytes to /path/foo.ts");
    expect(result).toContain("New file version: fv_xyz999");
  });

  // ── Default truncation ──

  it("passes through short results unchanged", () => {
    const input = "hello world";
    expect(formatToolResultForUI("bash", input)).toBe(input);
  });

  it("truncates long results at 600 chars with hint", () => {
    const input = "x".repeat(1000);
    const result = formatToolResultForUI("grep", input);
    expect(result.length).toBeLessThan(700);
    expect(result).toContain("… (400 more chars)");
    expect(result.startsWith("x".repeat(600))).toBe(true);
  });

  it("does not truncate result exactly at 600 chars", () => {
    const input = "y".repeat(600);
    const result = formatToolResultForUI("bash", input);
    expect(result).toBe(input);
    expect(result).not.toContain("more chars");
  });

  // ── Unknown tools get default truncation ──

  it("applies default truncation to unknown tool names", () => {
    const input = "a".repeat(900);
    const result = formatToolResultForUI("some_future_tool", input);
    expect(result).toContain("… (300 more chars)");
  });
});
