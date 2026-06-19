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

  // ── bash → ```sh code fence ──

  it("wraps bash short output in ```sh fence", () => {
    const result = formatToolResultForUI("bash", "hello world");
    expect(result).toBe("```sh\nhello world\n```");
  });

  it("wraps bash long output in ```sh fence with truncation", () => {
    const input = "x".repeat(1000);
    const result = formatToolResultForUI("bash", input);
    expect(result).toContain("```sh");
    expect(result).toContain("```");
    expect(result).toContain("… (400 more chars)");
    // Truncated content is inside the fence
    const inner = result.slice(6, -4); // strip ```sh\n and \n```
    expect(inner.startsWith("x".repeat(600))).toBe(true);
  });

  // ── grep / glob ──

  it("wraps grep non-JSON output in ``` fence with truncation", () => {
    const input = "x".repeat(1000);
    const result = formatToolResultForUI("grep", input);
    expect(result.startsWith("```\n")).toBe(true);
    expect(result.endsWith("\n```")).toBe(true);
    expect(result).toContain("… (400 more chars)");
  });

  it("pretty-prints grep JSON output in ```json fence", () => {
    const input = JSON.stringify({ results: [{ file: "a.ts", line: 1 }], total: 1 });
    const result = formatToolResultForUI("grep", input);
    expect(result.startsWith("```json\n")).toBe(true);
    expect(result.endsWith("\n```")).toBe(true);
    // Pretty-printed with 2-space indent
    expect(result).toContain('  "results"');
    expect(result).toContain('  "total"');
  });

  it("pretty-prints grep JSON with truncation when large", () => {
    const obj = { items: Array.from({ length: 200 }, (_, i) => ({ id: i, name: "item-" + i })) };
    const input = JSON.stringify(obj);
    const result = formatToolResultForUI("grep", input);
    expect(result.startsWith("```json\n")).toBe(true);
    expect(result.endsWith("\n```")).toBe(true);
    expect(result).toContain("more chars");
  });

  it("wraps glob non-JSON output in ``` fence", () => {
    const input = "src/a.ts\nsrc/b.ts\nsrc/c.ts";
    const result = formatToolResultForUI("glob", input);
    expect(result.startsWith("```\n")).toBe(true);
    expect(result.endsWith("\n```")).toBe(true);
  });

  it("pretty-prints glob JSON output in ```json fence", () => {
    const input = JSON.stringify([{ file: "a.ts" }, { file: "b.ts" }]);
    const result = formatToolResultForUI("glob", input);
    expect(result.startsWith("```json\n")).toBe(true);
    expect(result.endsWith("\n```")).toBe(true);
    expect(result).toContain('  "file"');
  });

  // ── read_file → ``` fence ──

  it("wraps read_file output in ``` fence", () => {
    const input = "const x = 1;\nconst y = 2;\n";
    const result = formatToolResultForUI("read_file", input);
    expect(result).toBe("```\nconst x = 1;\nconst y = 2;\n\n```");
  });

  it("truncates long read_file output inside ``` fence", () => {
    const input = "a".repeat(1000);
    const result = formatToolResultForUI("read_file", input);
    expect(result.startsWith("```\n")).toBe(true);
    expect(result.endsWith("\n```")).toBe(true);
    expect(result).toContain("more chars");
  });

  // ── default: JSON detection + truncation ──

  it("detects JSON in default branch and pretty-prints in ```json fence", () => {
    const input = JSON.stringify({ status: "ok", data: { value: 42 } });
    const result = formatToolResultForUI("some_future_tool", input);
    expect(result.startsWith("```json\n")).toBe(true);
    expect(result.endsWith("\n```")).toBe(true);
    expect(result).toContain('  "status"');
    expect(result).toContain('  "data"');
  });

  it("detects JSON array in default branch and pretty-prints", () => {
    const input = JSON.stringify([1, 2, 3]);
    const result = formatToolResultForUI("some_future_tool", input);
    expect(result.startsWith("```json\n")).toBe(true);
    expect(result.endsWith("\n```")).toBe(true);
    expect(result).toContain("  1,\n  2,\n  3");
  });

  it("does not code-fence non-JSON plain text in default branch", () => {
    const input = "plain text result";
    const result = formatToolResultForUI("some_future_tool", input);
    // Should be plain text, not wrapped in code fence
    expect(result).toBe(input);
    expect(result).not.toContain("```");
  });

  it("applies default truncation to unknown tool names (non-JSON)", () => {
    const input = "a".repeat(900);
    const result = formatToolResultForUI("some_future_tool", input);
    expect(result).toContain("… (300 more chars)");
    expect(result).not.toContain("```");
  });

  it("handles text starting with { but not valid JSON", () => {
    const input = "{not valid json";
    const result = formatToolResultForUI("some_future_tool", input);
    // Should be treated as plain text, not JSON
    expect(result).not.toContain("```json");
  });

  it("handles text starting with [ but not valid JSON", () => {
    const input = "[not valid json";
    const result = formatToolResultForUI("some_future_tool", input);
    expect(result).not.toContain("```json");
  });

  // ── Edge cases ──

  it("handles empty JSON object", () => {
    const input = "{}";
    const result = formatToolResultForUI("grep", input);
    expect(result).toBe("```json\n{}\n```");
  });

  it("handles empty JSON array", () => {
    const input = "[]";
    const result = formatToolResultForUI("grep", input);
    expect(result).toBe("```json\n[]\n```");
  });

  it("handles JSON with leading whitespace", () => {
    const input = '  \n  {"key": "value"}';
    const result = formatToolResultForUI("grep", input);
    expect(result.startsWith("```json\n")).toBe(true);
    expect(result).toContain('  "key"');
  });
});
