import { createElement } from "../../web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../web/node_modules/react-dom/server.node.js";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { ArtifactContainer } from "../../web/src/components/ArtifactContainer.js";
import { EvalDashboardView } from "../../web/src/components/EvalDashboardView.js";
import { ViewModeSelector } from "../../web/src/components/ViewModeSelector.js";
import {
  applyArtifactTheme,
  normalizeLegacyEvalTheme,
} from "../../web/src/utils/artifactTheme.js";
import { openEvalDashboardHtml } from "../../web/src/utils/evalExternalOpen.js";

describe("Eval Dashboard artifact presentation", () => {
  it("maps legacy Eval palette colors only inside CSS", () => {
    const legacy = `<!doctype html><html><head><style>
      body { background: #1e1c19; color: #e8e4dd; }
      .card { background: #282622; border-color: #3a3732; }
    </style></head><body>
      <div style="color:#d49708;background:rgba(212,151,8,0.15)">Legacy #1e1c19 report</div>
      <span style="color:#000">Status</span>
    </body></html>`;
    const normalized = normalizeLegacyEvalTheme(legacy);

    expect(normalized).toContain("background: var(--bg)");
    expect(normalized).toContain("color: var(--text)");
    expect(normalized).toContain("background: var(--surface)");
    expect(normalized).toContain("border-color: var(--border)");
    expect(normalized).toContain("color:var(--accent)");
    expect(normalized).toContain("color-mix(in srgb, var(--accent) 15%, transparent)");
    expect(normalized).toContain('style="color:var(--status-text)"');
    expect(normalized).toContain("Legacy #1e1c19 report");
  });

  it("overrides cached Dashboard theme tokens after artifact styles", () => {
    const source = "<!doctype html><html><head><style>:root{--bg:#f8f7f5}</style></head><body>Dashboard</body></html>";
    const darkHtml = applyArtifactTheme(source, "dark");
    const lightHtml = applyArtifactTheme(darkHtml, "light");

    expect(darkHtml.indexOf("--bg:#f8f7f5")).toBeLessThan(
      darkHtml.indexOf("--bg: #1e1c19"),
    );
    expect(darkHtml).toContain("color-scheme: dark");
    expect(darkHtml).toContain("--surface: #282622");
    expect(lightHtml).toContain("color-scheme: light");
    expect(lightHtml).toContain("--surface: #f3f2ef");
    expect(lightHtml).not.toContain("--bg: #1e1c19");
    expect(lightHtml.match(/id="dscode-artifact-theme"/g)).toHaveLength(1);
  });

  it("uses srcDoc with a script-free sandbox", () => {
    const markup = renderToStaticMarkup(createElement(ArtifactContainer, {
      presentation: {
        kind: "eval_dashboard",
        html: "<!doctype html><html><script>window.bad=true</script></html>",
        loading: false,
      },
      theme: "dark",
    }));

    expect(markup).toContain('sandbox="allow-same-origin"');
    expect(markup).not.toContain("allow-scripts");
    expect(markup).toContain("window.bad=true");
    expect(markup).toContain("--bg: #1e1c19");
    expect(markup).toContain("color-scheme:dark");
    expect(markup).toContain('title="CHIEF evaluation report"');
  });

  it("gives completed reports a full-height flex content slot", () => {
    const markup = renderToStaticMarkup(createElement(EvalDashboardView, {
      state: {
        status: "completed",
        targetSessionId: "target",
        runId: "run",
        startedAt: 1,
        stages: [],
        html: "<!doctype html><html><body>complete report</body></html>",
        generatedAt: 2,
      },
      theme: "light",
      onBackToChat: vi.fn(),
      onRetry: vi.fn(),
      onOpenExternal: vi.fn(),
    }));

    expect(markup).toContain(
      'class="flex-1 min-h-0 flex flex-col overflow-hidden"',
    );
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
      theme: "light",
      onBackToChat: vi.fn(),
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
      theme: "light",
      onBackToChat: vi.fn(),
      onRetry: vi.fn(),
      onOpenExternal: vi.fn(),
    }));

    expect(markup).toContain("chief-attribution (9f8e7d)");
    expect(markup).not.toContain("chief-attribution (agent-)");
  });

  it("shows only the same target's last complete report after failure", () => {
    const markup = renderToStaticMarkup(createElement(EvalDashboardView, {
      state: {
        status: "failed",
        targetSessionId: "target-A",
        runId: "failed-run",
        startedAt: 1,
        stages: [],
        activeStage: "attribution",
        error: "attribution invalid",
      },
      latestSuccessful: {
        formatVersion: 1,
        targetSessionId: "target-A",
        runId: "good-run",
        generatedAt: 2,
        accessedAt: 3,
        html: "<!doctype html><title>previous complete report</title>",
      },
      theme: "dark",
      onBackToChat: vi.fn(),
      onRetry: vi.fn(),
      onOpenExternal: vi.fn(),
    }));

    expect(markup).toContain("Failed · Previous report");
    expect(markup).toContain("Current evaluation failed at chief-attribution");
    expect(markup).toContain("attribution invalid");
    expect(markup).toContain("previous complete report");
    expect(markup).toContain("Showing the last complete report for this target");
    expect(markup).toContain('title="CHIEF evaluation report"');
  });

  it("does not show a successful report from another target", () => {
    const markup = renderToStaticMarkup(createElement(EvalDashboardView, {
      state: {
        status: "failed",
        targetSessionId: "target-A",
        runId: "failed-run",
        startedAt: 1,
        stages: [],
        activeStage: "attribution",
        error: "attribution invalid",
      },
      latestSuccessful: {
        formatVersion: 1,
        targetSessionId: "target-B",
        runId: "unrelated-run",
        generatedAt: 2,
        accessedAt: 3,
        html: "<!doctype html><title>unrelated report</title>",
      },
      theme: "light",
      onBackToChat: vi.fn(),
      onRetry: vi.fn(),
      onOpenExternal: vi.fn(),
    }));

    expect(markup).toContain("Evaluation stopped at chief-attribution");
    expect(markup).not.toContain("unrelated report");
    expect(markup).not.toContain("<iframe");
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
    const evalModeDashboardButton = available.match(
      /<button[^>]*aria-label="Session Dashboard"[^>]*>/,
    )?.[0];
    expect(availableEvalButton).not.toContain('disabled=""');
    expect(evalModeDashboardButton).toContain('disabled=""');

    const chatAvailable = renderToStaticMarkup(createElement(ViewModeSelector, {
      viewMode: "chat",
      sessionDashboardAvailable: true,
      evalReportAvailable: false,
      onChange: vi.fn(),
    }));
    const chatModeDashboardButton = chatAvailable.match(
      /<button[^>]*aria-label="Session Dashboard"[^>]*>/,
    )?.[0];
    expect(chatModeDashboardButton).not.toContain('disabled=""');
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

  it("keeps lifecycle metadata and stage text legible", () => {
    const css = readFileSync(
      new URL("../../web/src/index.css", import.meta.url),
      "utf8",
    );

    expect(css).toMatch(
      /\.eval-state-copy\s*\{[^}]*font-size:\s*14px;/s,
    );
    expect(css).toMatch(
      /\.eval-run-stat strong\s*\{[^}]*font-size:\s*14px;/s,
    );
    expect(css).toMatch(
      /\.eval-stage-name\s*\{[^}]*font-size:\s*13px;/s,
    );
    expect(css).toMatch(
      /\.eval-stage-description\s*\{[^}]*font-size:\s*13px;/s,
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
      "dark",
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
    expect(await blob?.text()).toContain("received report");
    expect(await blob?.text()).toContain("color-scheme: dark");
    expect(await blob?.text()).toContain("--bg: #1e1c19");
  });
});
