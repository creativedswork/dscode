import { describe, expect, it } from "vitest";

import type { UIMessage } from "../../src/ui/shared/types.js";
import { projectTraceTree } from "../../src/ui/shared/trace-tree.js";
import {
  buildTraceWidgetHtml,
  prepareSessionDashboardHtml,
} from "../../web/src/utils/traceWidget.js";

function message(overrides: Partial<UIMessage> = {}): UIMessage {
  return {
    id: "m1",
    role: "user",
    content: "",
    ...overrides,
  };
}

describe("trace widget injection", () => {
  it("embeds the projected tree and fullscreen control", () => {
    const tree = projectTraceTree([
      message({ id: "u1", role: "user", content: "hi", createdAt: 1000 }),
    ]);
    const html = buildTraceWidgetHtml(tree);

    expect(html).toContain('id="traceWidget"');
    expect(html).toContain('id="fullscreenBtn"');
    expect(html).toContain("fullscreen");
    expect(html).toContain('"kind":"agent"');
    expect(html).toContain('"id":"u1"');
    // Escape guard: raw "<" is not emitted into the script body.
    expect(html).not.toContain('"id":"<');
  });

  it("injects the widget into the reserved trace-tree slot", () => {
    const report = "<html><head></head><body><div id=\"trace-tree\"></div></body></html>";
    const tree = projectTraceTree([
      message({ id: "u1", role: "user", content: "hi", createdAt: 1000 }),
    ]);
    const out = prepareSessionDashboardHtml(report, "light", tree);

    expect(out).toContain('id="traceWidget"');
    expect(out).not.toContain('id="trace-tree"');
    expect(out).toContain('id="fullscreenBtn"');
  });

  it("strips pre-existing LLM script tags before injection", () => {
    const report = '<html><head></head><body><script>alert("x")</script><div id="trace-tree"></div></body></html>';
    const tree = projectTraceTree([
      message({ id: "u1", role: "user", content: "hi", createdAt: 1000 }),
    ]);
    const out = prepareSessionDashboardHtml(report, "light", tree);

    expect(out).not.toContain('alert("x")');
    expect(out).toContain('id="traceWidget"');
  });

  it("appends the widget before </body> when the slot is missing", () => {
    const report = "<html><head></head><body><p>no slot</p></body></html>";
    const tree = projectTraceTree([
      message({ id: "u1", role: "user", content: "hi", createdAt: 1000 }),
    ]);
    const out = prepareSessionDashboardHtml(report, "light", tree);

    expect(out).toContain('id="traceWidget"');
    expect(out.indexOf("traceWidget")).toBeLessThan(out.indexOf("</body>"));
  });

  it("renders an empty state when no trace tree is available", () => {
    const out = prepareSessionDashboardHtml(
      "<html><body><div id=\"trace-tree\"></div></body></html>",
      "light",
      null,
    );

    expect(out).toContain('id="traceWidget"');
    expect(out).toContain("No trace data available");
  });

  it("produces a widget for a Main-only tree with no subagents", () => {
    const tree = projectTraceTree([
      message({ id: "u1", role: "user", content: "hi", createdAt: 1000 }),
    ]);
    expect(tree.root.kind).toBe("agent");
    expect(tree.root.children).toHaveLength(1);

    const out = buildTraceWidgetHtml(tree);
    expect(out).toContain('"kind":"agent"');
  });
});
