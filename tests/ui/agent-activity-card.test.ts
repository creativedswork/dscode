import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "../../web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../web/node_modules/react-dom/server.node.js";
import { describe, expect, it, vi } from "vitest";

import type { AgentActivity } from "../../src/ui/shared/types.js";
import { formatSubagentLabel } from "../../src/ui/shared/agent-label.js";
import {
  AGENT_STATUS_LABELS,
  AgentActivityCard,
  formatAgentDuration,
  summarizeAgentText,
} from "../../web/src/components/AgentActivityCard.js";
import { findPermissionOwnerAgentId } from "../../web/src/components/ChatView.js";
import { formatAgentDisplayId } from "../../src/ui/shared/agent-id.js";

function activity(overrides: Partial<AgentActivity> = {}): AgentActivity {
  return {
    agentId: "agent-abcdef12-3456",
    parentAgentId: "main-1",
    parentSessionId: "session-1",
    label: "Researcher",
    application: "general",
    attachment: "background",
    state: "running",
    input: "inspect the implementation",
    createdAt: 1000,
    startedAt: 2000,
    ...overrides,
  };
}

describe("AgentActivityCard", () => {
  it.each([
    ["running", "Running"],
    ["waiting", "Waiting"],
    ["completed", "Completed"],
    ["failed", "Failed"],
    ["terminated", "Terminated"],
    ["killed", "Killed"],
  ] as const)("renders %s with text and state styling", (state, label) => {
    const source = readFileSync(
      resolve("web/src/components/AgentActivityCard.tsx"),
      "utf8",
    );

    expect(AGENT_STATUS_LABELS[state]).toBe(label);
    expect(source).toContain("state-${activity.state}");
    expect(source).toContain('data-collider="agent-card"');
    expect(source).not.toContain("phase-label");
  });

  it("truncates long summaries and leaves short summaries intact", () => {
    expect(summarizeAgentText("short result", 20)).toBe("short result");
    expect(summarizeAgentText("one   two\nthree four", 13)).toBe("one two thre…");
  });

  it("shows the delegated role without exposing the Application name", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentActivityCard, {
        activity: activity(),
      }),
    );

    expect(markup).toContain("Researcher");
    expect(markup).not.toContain(">general<");
    expect(markup).toContain('aria-label="Researcher SubAgent Activity"');
  });

  it("derives a concise role label from the delegation description", () => {
    expect(formatSubagentLabel("Researcher: verify paper claims")).toBe(
      "Researcher",
    );
    expect(formatSubagentLabel("内容策略师：规划六张卡片")).toBe("内容策略师");
    expect(formatSubagentLabel(undefined, "vision")).toBe("Vision");
    expect(formatSubagentLabel()).toBe("SubAgent");
  });

  it("shows an accessible collapsed details control only for long output", () => {
    const source = readFileSync(
      resolve("web/src/components/AgentActivityCard.tsx"),
      "utf8",
    );

    expect(summarizeAgentText("line ".repeat(80), 220)).toMatch(/…$/);
    expect(summarizeAgentText("Done", 220)).toBe("Done");
    expect(source).toContain("aria-expanded={expanded}");
    expect(source).toContain("aria-controls={detailsId}");
    expect(source).toContain("onClick={() => setExpanded");
    expect(source).toContain('type="button"');
  });

  it("renders Agent output as Markdown in both preview and details", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const markup = renderToStaticMarkup(
      createElement(AgentActivityCard, {
        activity: activity({
          state: "completed",
          output: "**Bold result**\n\n- first item\n- second item",
          endedAt: 3000,
        }),
      }),
    );
    consoleError.mockRestore();

    expect(markup).toContain("<strong>Bold result</strong>");
    expect(markup).toContain('<li data-collider="text-block">first item</li>');
    expect(markup).toContain('<li data-collider="text-block">second item</li>');
    expect(markup).not.toContain("**Bold result**");
  });

  it("exposes progress semantics and a bounded Markdown details container", () => {
    const source = readFileSync(
      resolve("web/src/components/AgentActivityCard.tsx"),
      "utf8",
    );
    const css = readFileSync(resolve("web/src/index.css"), "utf8");

    expect(source).toContain('role="progressbar"');
    expect(source).toContain("aria-valuenow={progressPercent}");
    expect(source).toContain("progress.message");
    expect(source).toContain("<Markdown");
    expect(source).not.toContain("<pre id={detailsId}");
    expect(css).toMatch(/\.agent-activity-result\.expanded\s*\{[^}]*max-height:\s*320px;[^}]*overflow-y:\s*auto;/s);
  });

  it("places the expanded Tools toggle below the Tool list", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentActivityCard, {
        activity: activity({
          tools: [{
            toolCallId: "call-read",
            name: "read_file",
            status: "completed",
            summary: "src/core/harness.ts",
            startedAt: 1200,
            endedAt: 1300,
          }],
        }),
      }),
    );

    expect(markup).toContain("Hide tools");
    expect(markup.indexOf("agent-activity-tool-list")).toBeLessThan(
      markup.indexOf("agent-activity-tools-toggle"),
    );
  });

  it("renders an interactive permission inside its matching Tool", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentActivityCard, {
        activity: activity({
          state: "waiting",
          tools: [{
            toolCallId: "call-bash",
            name: "bash",
            status: "permission",
            summary: "{\"command\":\"pwd\"}",
            startedAt: 1200,
          }],
          permission: {
            toolName: "bash",
            preview: "$ pwd",
            toolCallId: "call-bash",
          },
        }),
        permissionToolCallId: "call-bash",
        permissionControl: createElement(
          "button",
          { type: "button", "data-permission-control": true },
          "Allow",
        ),
      }),
    );

    expect(markup).toContain("agent-activity-tool state-permission");
    expect(markup).toContain("Permission required");
    expect(markup).toContain('data-permission-control="true"');
    expect(markup.indexOf("data-permission-control")).toBeGreaterThan(
      markup.indexOf("agent-activity-tool state-permission"),
    );
  });

  it("routes only attributable SubAgent permissions into an Agent Card", () => {
    const messages = [{
      id: "agent-agent-1",
      role: "agent" as const,
      content: "",
      agentActivity: activity({
        agentId: "agent-1",
        permission: {
          toolName: "bash",
          preview: "$ pwd",
          toolCallId: "call-bash",
        },
      }),
    }];

    expect(findPermissionOwnerAgentId(messages, {
      toolName: "bash",
      preview: "$ pwd",
      agentId: "agent-1",
      toolCallId: "call-bash",
    })).toBe("agent-1");
    expect(findPermissionOwnerAgentId(messages, {
      toolName: "bash",
      preview: "$ pwd",
      toolCallId: "call-bash",
    })).toBe("agent-1");
    expect(findPermissionOwnerAgentId(messages, {
      toolName: "bash",
      preview: "$ pwd",
    })).toBeUndefined();
  });

  it("freezes terminal duration at endedAt", () => {
    expect(formatAgentDuration(activity({
      state: "completed",
      startedAt: 2000,
      endedAt: 67000,
    }), 999999)).toBe("1m 5s");
  });

  it("shows only the first six characters after the agent prefix", () => {
    expect(formatAgentDisplayId("agent-abcdef12-3456")).toBe("abcdef");
    expect(formatAgentDisplayId("custom-process-id")).toBe("custom");

    const source = readFileSync(
      resolve("web/src/components/AgentActivityCard.tsx"),
      "utf8",
    );
    expect(source).toContain("agent id: {formatAgentDisplayId(activity.agentId)}");
  });

  it("routes agent_activity events through the Web conversation reducer", () => {
    const source = readFileSync(resolve("web/src/components/App.tsx"), "utf8");

    expect(source).toMatch(
      /case "agent_activity":[\s\S]*?setMessages\(\(prev\) => conversationReducer\(prev, event\)\)/,
    );
  });
});
