// ── Session Stats Computation ──
// Pure computation: metadata formatting + tool statistics. No inference, no rules.
// Replaces the deterministic portions of analyzer.ts.

import type { SerializedSession, SessionMetadata } from "../session/types.js";
import type { SessionMeta, ToolStats } from "./types.js";

// ── Helpers ──

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 1) return "< 1m";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function formatTime(ts: number): string {
  if (ts == null || isNaN(ts)) return "unknown";
  try {
    return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
  } catch {
    return "unknown";
  }
}

function getToolCallNames(msg: Record<string, unknown>): string[] {
  if (msg["role"] !== "assistant" || !Array.isArray(msg["content"])) return [];
  const tools: string[] = [];
  for (const block of msg["content"] as Record<string, unknown>[]) {
    if (block["type"] === "toolCall") tools.push((block["name"] as string) ?? "unknown");
  }
  return tools;
}

function isToolResultError(msg: Record<string, unknown>): boolean {
  if (msg["role"] !== "toolResult") return false;
  if (msg["isError"] === true) return true;
  if ((msg["details"] as Record<string, unknown> | undefined)?.["error"]) {
    const content = typeof msg["content"] === "string"
      ? msg["content"]
      : Array.isArray(msg["content"])
        ? (msg["content"] as Record<string, unknown>[]).find((b) => b["type"] === "text")?.["text"] as string ?? ""
        : "";
    if (content.trim() === "Exit code: 0") return false;
    return true;
  }
  return false;
}

function isScreenshotCall(toolNames: string[]): boolean {
  return toolNames.some((n) => n.toLowerCase().includes("screenshot"));
}

// ── SessionStats ──

export interface SessionStats {
  metadata: SessionMeta;
  stats: ToolStats;
}

// ── Main Computation ──

export function computeStats(data: SerializedSession): SessionStats {
  const messages = data.messages as Record<string, unknown>[];
  const meta = data.metadata as SessionMetadata;

  // Metadata
  const duration = meta.updatedAt - meta.createdAt;
  const metadata: SessionMeta = {
    sessionId: meta.id,
    title: meta.title,
    model: `${meta.modelProvider ?? "unknown"}/${meta.modelId ?? "unknown"}`,
    totalMessages: meta.messageCount,
    duration: formatDuration(duration),
    projectPath: meta.projectPath ?? "",
    startedAt: formatTime(meta.createdAt),
    endedAt: formatTime(meta.updatedAt),
  };

  // Tool stats
  let toolCalls = 0;
  let toolErrors = 0;
  let screenshotsTaken = 0;
  for (const msg of messages) {
    const names = getToolCallNames(msg);
    toolCalls += names.length;
    if (isScreenshotCall(names)) screenshotsTaken++;
    if (isToolResultError(msg)) toolErrors++;
  }
  const errorRate = toolCalls > 0 ? ((toolErrors / toolCalls) * 100).toFixed(1) + "%" : "0.0%";

  const stats: ToolStats = {
    toolCalls,
    toolErrors,
    errorRate,
    screenshotsTaken,
    userComplaints: 0, // LLM now handles complaint detection
  };

  return { metadata, stats };
}
