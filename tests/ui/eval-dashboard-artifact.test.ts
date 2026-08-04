import { createElement } from "../../web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../web/node_modules/react-dom/server.node.js";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { ArtifactContainer } from "../../web/src/components/ArtifactContainer.js";
import { EvalDashboardView } from "../../web/src/components/EvalDashboardView.js";
import { ViewModeSelector } from "../../web/src/components/ViewModeSelector.js";
import { openEvalDashboardHtml } from "../../web/src/utils/evalExternalOpen.js";

describe("Eval Dashboard artifact presentation", () => {
  it("uses srcDoc with a script-free sandbox", () => {
    const markup = renderToStaticMarkup(createElement(ArtifactContainer, {
      presentation: {
        kind: "eval_dashboard",
        html: "<!doctype html><html><script>window.bad=true</script></html>",
        loading: false,
      },
    }));

    expect(markup).toContain('sandbox="allow-same-origin"');
    expect(markup).not.toContain("allow-scripts");
    expect(markup).toContain("window.bad=true");
    expect(markup).toContain('title="CHIEF evaluation report"');
  });

  it("escapes failed error text through React rendering", () => {
    const markup = renderToStaticMarkup(createElement(EvalDashboardView, {
      state: {
        status: "failed",
        targetSessionId: "target",
        runId: "run",
        startedAt: 1,
        stages: [],
        activeStage: "attribution",
        error: "<img src=x onerror=alert(1)>",
      },
      onBackToChat: vi.fn(),
      onOpenLatest: vi.fn(),
      onRetry: vi.fn(),
      onOpenExternal: vi.fn(),
    }));

    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(markup).not.toContain("<img src=x");
    expect(markup).toContain("Read-only eval artifact");
  });

  it("uses the shared six-character Agent display ID", () => {
    const markup = renderToStaticMarkup(createElement(EvalDashboardView, {
      state: {
        status: "running",
        targetSessionId: "target",
        runId: "run",
        startedAt: Date.now(),
        actorCount: 1,
        stepCount: 1,
        stages: [],
        application: "chief-attribution",
        workerAgentId: "agent-9f8e7d66",
        retryCount: 1,
      },
      onBackToChat: vi.fn(),
      onOpenLatest: vi.fn(),
      onRetry: vi.fn(),
      onOpenExternal: vi.fn(),
    }));

    expect(markup).toContain("chief-attribution (9f8e7d)");
    expect(markup).not.toContain("chief-attribution (agent-)");
  });

  it("always renders an enabled Eval selector action", () => {
    const unavailable = renderToStaticMarkup(createElement(ViewModeSelector, {
      viewMode: "chat",
      sessionDashboardAvailable: false,
      evalReportAvailable: false,
      onChange: vi.fn(),
    }));
    const evalButton = unavailable.match(
      /<button[^>]*aria-label="Eval Dashboard"[^>]*>/,
    )?.[0];

    expect(evalButton).not.toContain('disabled=""');
    expect(evalButton).toContain('title="Eval Dashboard"');
    expect(unavailable).toContain(">Eval</span>");

    const available = renderToStaticMarkup(createElement(ViewModeSelector, {
      viewMode: "eval_dashboard",
      sessionDashboardAvailable: true,
      evalReportAvailable: true,
      onChange: vi.fn(),
    }));
    const availableEvalButton = available.match(
      /<button[^>]*aria-label="Eval Dashboard"[^>]*>/,
    )?.[0];
    expect(availableEvalButton).not.toContain('disabled=""');
  });

  it("uses a full-surface lifecycle layout instead of a fixed-width card", () => {
    const css = readFileSync(
      new URL("../../web/src/index.css", import.meta.url),
      "utf8",
    );

    expect(css).not.toContain("width: min(610px, 100%)");
    expect(css).toMatch(
      /\.eval-state-wrap\s*\{[^}]*align-items:\s*stretch;[^}]*padding:\s*16px;/s,
    );
    expect(css).toMatch(
      /\.eval-state-card\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*100%;/s,
    );
  });

  it("opens received HTML through a Blob URL without a server command", async () => {
    let blob: Blob | undefined;
    const objectUrlApi = {
      createObjectURL: vi.fn((value: Blob) => {
        blob = value;
        return "blob:dscode-eval";
      }),
      revokeObjectURL: vi.fn(),
    };
    const opener = vi.fn();

    const url = openEvalDashboardHtml(
      "<html>received report</html>",
      objectUrlApi,
      opener,
    );

    expect(url).toBe("blob:dscode-eval");
    expect(opener).toHaveBeenCalledWith(
      "blob:dscode-eval",
      "_blank",
      "noopener,noreferrer",
    );
    expect(blob?.type).toBe("text/html;charset=utf-8");
    expect(await blob?.text()).toBe("<html>received report</html>");
  });
});
