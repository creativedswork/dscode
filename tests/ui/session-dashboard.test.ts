import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SessionManager } from "../../src/session/manager.js";
import type { AgentSessionMessage } from "../../src/session/types.js";
import {
  buildDashboardThemeContract,
  buildDashboardSubagentSummary,
  buildSessionDashboardUserPrompt,
  DASHBOARD_AGENT_OUTCOME_SUMMARY_LIMIT,
  DASHBOARD_AGENT_TASK_SUMMARY_LIMIT,
  formatDashboardDuration,
  summarizeDashboardAgentText,
  WebUiBackend,
} from "../../src/ui/web/web-backend.js";
import {
  createDashboardCacheEntry,
  isDashboardCacheEntryValid,
} from "../../web/src/utils/dashboardCache.js";

function agentMessage(
  overrides: Partial<AgentSessionMessage> = {},
): AgentSessionMessage {
  return {
    role: "subagent",
    agentId: "agent-123456789",
    application: "explorer",
    state: "completed",
    input: { prompt: "Inspect the dashboard cache" },
    output: { text: "The cache excludes Agent records" },
    createdAt: 1000,
    startedAt: 2000,
    endedAt: 7000,
    ...overrides,
  };
}

describe("Session Dashboard SubAgent summary", () => {
  it("normalizes and bounds Agent text", () => {
    expect(summarizeDashboardAgentText("  one\n two\tthree  ", 40)).toBe(
      "one two three",
    );
    const longInput = "input ".repeat(100);
    const longResult = "result ".repeat(100);

    const taskSummary = summarizeDashboardAgentText(
      longInput,
      DASHBOARD_AGENT_TASK_SUMMARY_LIMIT,
    );
    const outcomeSummary = summarizeDashboardAgentText(
      longResult,
      DASHBOARD_AGENT_OUTCOME_SUMMARY_LIMIT,
    );
    expect(taskSummary.length).toBeLessThanOrEqual(
      DASHBOARD_AGENT_TASK_SUMMARY_LIMIT,
    );
    expect(outcomeSummary.length).toBeLessThanOrEqual(
      DASHBOARD_AGENT_OUTCOME_SUMMARY_LIMIT,
    );
    expect(taskSummary).toMatch(/\.\.\.$/);
    expect(outcomeSummary).toMatch(/\.\.\.$/);
  });

  it("keeps only the first sentence for Agent overview text", () => {
    expect(
      summarizeDashboardAgentText(
        "这是一张充满古典韵味的人像摄影作品。以下是画面的详细描述：人物形象很多。",
        DASHBOARD_AGENT_OUTCOME_SUMMARY_LIMIT,
      ),
    ).toBe("这是一张充满古典韵味的人像摄影作品。");
  });

  it("formats raw durations for Dashboard labels", () => {
    expect(formatDashboardDuration(250)).toBe("250ms");
    expect(formatDashboardDuration(9000)).toBe("9s");
    expect(formatDashboardDuration(125000)).toBe("2m 5s");
    expect(formatDashboardDuration(3_720_000)).toBe("1h 2m");
  });

  it("aggregates completed and failed Agents in creation order", () => {
    const summary = buildDashboardSubagentSummary([
      agentMessage({
        agentId: "agent-later999",
        application: "vision",
        createdAt: 3000,
        startedAt: 4000,
        endedAt: 10_000,
      }),
      agentMessage({
        agentId: "agent-failed88",
        state: "failed",
        output: { error: "Process exited" },
        createdAt: 2000,
        startedAt: 2500,
        endedAt: 4500,
      }),
      agentMessage(),
    ]);

    expect(summary).toMatchObject({
      total: 3,
      stateCounts: {
        completed: 2,
        failed: 1,
        terminated: 0,
        killed: 0,
      },
      successRate: 67,
      totalDurationMs: 13_000,
      totalDurationFormatted: "13s",
      applicationCounts: {
        explorer: 2,
        vision: 1,
      },
    });
    expect(summary.records.map((record) => record.agentId)).toEqual([
      "123456",
      "failed",
      "later9",
    ]);
    expect(summary.records[1]).toMatchObject({
      state: "failed",
      outcomeSummary: "Process exited",
      outcomeKind: "error",
    });
    expect(summary.records[1]).not.toHaveProperty("inputSummary");
    expect(summary.records[1]).not.toHaveProperty("resultSummary");
  });

  it("returns an explicit empty Agent summary", () => {
    expect(buildDashboardSubagentSummary([])).toEqual({
      total: 0,
      stateCounts: {
        completed: 0,
        failed: 0,
        terminated: 0,
        killed: 0,
      },
      successRate: null,
      totalDurationMs: 0,
      totalDurationFormatted: "0ms",
      applicationCounts: {},
      records: [],
    });
  });

  it("includes migrated legacy Vision records as ordinary Agents", () => {
    const manager = new SessionManager(
      mkdtempSync(join(tmpdir(), "dashboard-vision-")),
      "/test/project",
      { error: () => {} } as any,
    );
    const session = manager.createSession("provider", "model");
    manager.appendVisionMessage(session.id, {
      turnIndex: 1,
      messageIndex: 2,
      images: [],
      prompt: "Read this screenshot",
      description: "The layout overflows",
      modelProvider: "provider",
      modelId: "vision-model",
      timestamp: 1000,
    });

    const summary = buildDashboardSubagentSummary(manager.agentMessages);
    expect(summary.total).toBe(1);
    expect(summary.records[0]).toMatchObject({
      application: "vision",
      state: "completed",
      taskSummary: "Read this screenshot",
      outcomeSummary: "The layout overflows",
    });
  });

  it("adds SubAgents without removing existing Dashboard metrics", () => {
    const summary = JSON.parse(
      (WebUiBackend.prototype as any).buildSessionSummary.call({
        harness: {
          sessionManager: {
            getTotalActiveMs: () => 12_000,
            agentMessages: [agentMessage()],
          },
          agent: {
            state: {
              messages: [
                { role: "user", content: "private Main message" },
                {
                  role: "assistant",
                  content: [{ type: "toolCall", name: "read_file" }],
                },
              ],
            },
          },
          contextManager: {
            getCategoryBreakdown: () => ({
              total: 1000,
              used: 600,
              free: 400,
              categories: { system: 100, user: 200, other: 300 },
            }),
          },
        },
        currentAssistant: null,
        getSkillToolNames: () => new Set<string>(),
      }),
    );

    expect(summary).toMatchObject({
      tokenUsage: { total: 1000, used: 600, usagePercent: 60 },
      toolStatistics: { totalToolsCalled: 1 },
      timing: { sessionActiveMs: 12_000, turnCount: 1 },
      contextHealth: { pressureScore: 60, pressureLabel: "moderate" },
      subagents: { total: 1, successRate: 100 },
    });
    expect(JSON.stringify(summary)).not.toContain("private Main message");
  });

  it("builds a prompt that preserves existing metrics and adds Agent states", () => {
    const prompt = buildSessionDashboardUserPrompt('{"subagents":{"total":1}}');

    expect(prompt).toContain("token usage and category breakdown");
    expect(prompt).toContain("context pressure");
    expect(prompt).toContain("Agent Processes");
    expect(prompt).toContain("six-character Agent ID");
    expect(prompt).toContain("Delegated time");
    expect(prompt).toContain("Main Agent only");
    expect(prompt).toContain('Do NOT use "Input:" or "Result:" labels');
    expect(prompt).toContain("Do NOT copy full SubAgent input/output");
    expect(prompt).toContain("must not be duplicated in Dashboard");
    expect(prompt).toContain('{"subagents":{"total":1}}');
  });

  it("requires generated Dashboard colors to use runtime theme tokens", () => {
    const source = buildDashboardThemeContract();

    expect(source).toContain("DESIGN SYSTEM THEME CONTRACT");
    expect(source).toContain("--bg: #f8f7f5");
    expect(source).toContain("--surface: #f3f2ef");
    expect(source).toContain("Use these variables for EVERY theme-dependent color");
    expect(source).toContain("follows light and dark mode");
    expect(source).not.toContain("DESIGN SYSTEM COLORS");
  });

  it("rejects cached dashboards created before the overview-only format", () => {
    expect(
      isDashboardCacheEntryValid(
        { contentHash: "same", html: "<html>old detail</html>" },
        "same",
      ),
    ).toBe(false);
    expect(
      isDashboardCacheEntryValid(
        createDashboardCacheEntry("same", "<html>overview</html>"),
        "same",
      ),
    ).toBe(true);
  });
});
