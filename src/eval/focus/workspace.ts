// ── CHIFF Workspace Generator ──
// Creates the file-system work directory for Agent exploration:
//   ~/.dscode/eval/{sessionId}/library/    ← pipeline writes, Agent reads
//   ~/.dscode/eval/{sessionId}/notebook/    ← Agent writes analysis notes
//   ~/.dscode/eval/{sessionId}/output/      ← Agent writes structured JSON

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { EvalResult } from "../types.js";
import type { HistoryStep } from "../schemas.js";
import type {
  SessionSkeleton,
  PhaseEntry,
  SignalAnchor,
  SignalType,
  HotZone,
  ColdZone,
  DataItemTracking,
} from "./types.js";

// ── Export Types ──

export type CHIFFPhase = "SCAN" | "ZOOM" | "SYNTHESIZE";

// ── Path Helpers ──

export function evalBaseDir(): string {
  return join(homedir(), ".dscode", "eval");
}

export function workspaceDir(sessionId: string): string {
  return join(evalBaseDir(), sessionId);
}

// ── Directory Creation ──

export function createWorkspace(sessionId: string): string {
  const root = workspaceDir(sessionId);

  // Clean existing workspace if present
  if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true });
  }

  // Create directory structure
  mkdirSync(join(root, "library", "steps"), { recursive: true });
  mkdirSync(join(root, "notebook"), { recursive: true });
  mkdirSync(join(root, "output"), { recursive: true });

  return root;
}

// ── File Writers ──

export function writeLibraryMetadata(
  skeleton: SessionSkeleton,
  workspacePath: string,
): string {
  const { meta, stats } = skeleton;
  const content = [
    "# Session Metadata",
    "",
    `| 字段 | 值 |`,
    `|------|-----|`,
    `| Question | ${meta.question} |`,
    `| Total Steps | ${meta.totalSteps} |`,
    `| Total Messages | ${meta.totalMessages} |`,
    `| Error Rate | ${meta.errorRate} |`,
    `| Duration | ${meta.duration} |`,
    `| Model | ${meta.model} |`,
    "",
    "## Statistics",
    "",
    `| 指标 | 值 |`,
    `|------|-----|`,
    `| Tool Calls | ${stats.toolCalls} |`,
    `| Tool Errors | ${stats.toolErrors} |`,
    `| User Complaints | ${stats.userComplaints} |`,
    `| Screenshots Taken | ${stats.screenshotsTaken} |`,
    "",
  ].join("\n");

  const filePath = join(workspacePath, "library", "meta.md");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

export function writeLibrarySkeleton(
  skeleton: SessionSkeleton,
  workspacePath: string,
): string {
  const lines: string[] = [];

  // Phase Map Table
  lines.push("# Phase Map");
  lines.push("");
  lines.push("| Phase | Label | Step Range | Status | Tool Summary |");
  lines.push("|-------|-------|------------|--------|--------------|");
  for (const p of skeleton.phases) {
    const statusIcon = p.status === "danger" ? "🔴" : p.status === "warn" ? "🟡" : "🟢";
    lines.push(`| ${p.id} | ${p.label} | ${p.stepRange} | ${statusIcon} ${p.status} | ${p.toolSummary} |`);
  }
  lines.push("");

  // Hot Zones
  lines.push("# Hot Zones");
  lines.push("");
  if (skeleton.hotZones.length === 0) {
    lines.push("_No hot zones detected._");
    lines.push("");
  } else {
    for (let i = 0; i < skeleton.hotZones.length; i++) {
      const hz = skeleton.hotZones[i];
      const errorCount = hz.steps.filter((s) => s.isError).length;
      const first5 = hz.steps.slice(0, 5).map((s) => s.agent).join(", ");
      lines.push(`## Hot Zone ${i + 1}: Steps ${hz.stepStart}–${hz.stepEnd}`);
      lines.push("");
      lines.push(`- **Suspicion Score**: ${hz.suspicionScore.toFixed(2)}`);
      lines.push(`- **Primary Signal**: ${hz.primarySignal}`);
      lines.push(`- **Signal Count**: ${hz.signals.length}`);
      lines.push(`- **Error Count**: ${errorCount}/${hz.steps.length}`);
      lines.push(`- **First 5 Agents**: ${first5}`);
      lines.push("");
    }
  }

  // Cold Zones
  lines.push("# Cold Zones");
  lines.push("");
  if (skeleton.coldZones.length === 0) {
    lines.push("_No cold zones._");
    lines.push("");
  } else {
    for (const cz of skeleton.coldZones) {
      const toolList = Object.entries(cz.toolCountByAgent)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([tool, count]) => `${tool}(${count})`)
        .join(", ");
      lines.push(`- **Range ${cz.stepRange}**: ${cz.errorCount} errors, ${cz.userMessages} user messages`);
      lines.push(`  Top tools: ${toolList || "none"}`);
    }
    lines.push("");
  }

  // Analysis Hints
  lines.push("# Analysis Hints");
  lines.push("");
  const hints: string[] = [];
  if (skeleton.hotZones.length > 0) {
    hints.push(`- Focus on the ${skeleton.hotZones.length} hot zones — they contain the densest signal clusters.`);
  }
  if (skeleton.dataItems.some((d) => d.isHot)) {
    hints.push("- Hot data items (marked 🔥) indicate files with heavy churn — check for repair loops.");
  }
  if (skeleton.signalAnchors.filter((s) => s.type === "user_complaint").length > 0) {
    hints.push("- User complaints present — cross-reference with surrounding tool errors.");
  }
  if (hints.length === 0) {
    hints.push("- Review the phase map and signal anchors for any patterns.");
  }
  lines.push(hints.join("\n"));
  lines.push("");

  const filePath = join(workspacePath, "library", "skeleton.md");
  writeFileSync(filePath, lines.join("\n"), "utf-8");
  return filePath;
}

export function writeLibrarySignals(
  skeleton: SessionSkeleton,
  workspacePath: string,
): string {
  // Group by signal type, with predefined order
  const typeOrder: SignalType[] = [
    "user_complaint",
    "tool_error",
    "screenshot_divergence",
    "phase_boundary",
    "root_cause_evidence",
  ];

  const grouped = new Map<SignalType, SignalAnchor[]>();
  for (const sig of skeleton.signalAnchors) {
    if (!grouped.has(sig.type)) grouped.set(sig.type, []);
    grouped.get(sig.type)!.push(sig);
  }

  // Sort within groups by priority (high → medium)
  for (const [, signals] of grouped) {
    signals.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  const lines: string[] = ["# Signal Anchors", ""];

  for (const type of typeOrder) {
    const signals = grouped.get(type);
    if (!signals || signals.length === 0) continue;

    const typeLabel: Record<string, string> = {
      user_complaint: "用户投诉",
      tool_error: "工具错误",
      screenshot_divergence: "截图偏离",
      phase_boundary: "阶段边界",
      root_cause_evidence: "根因证据",
    };

    lines.push(`## ${typeLabel[type] ?? type} (${signals.length})`);
    lines.push("");
    for (const sig of signals) {
      const badge = sig.priority === "high" ? "🔴 HIGH" : "🟡 MED";
      lines.push(`- **Step ${sig.stepId}** ${badge}: ${sig.label.slice(0, 100)}`);
    }
    lines.push("");
  }

  if (skeleton.signalAnchors.length === 0) {
    lines.push("_No signal anchors detected._");
    lines.push("");
  }

  const filePath = join(workspacePath, "library", "signals.md");
  writeFileSync(filePath, lines.join("\n"), "utf-8");
  return filePath;
}

export function writeLibraryDataItems(
  skeleton: SessionSkeleton,
  workspacePath: string,
): string {
  const sorted = [...skeleton.dataItems]
    .sort((a, b) => b.operationCount - a.operationCount);

  const lines: string[] = [
    `# Data Items (${sorted.length} tracked, ${sorted.filter((d) => d.isHot).length} hot)`,
    "",
  ];

  if (sorted.length === 0) {
    lines.push("_No data items tracked._");
  } else {
    for (const item of sorted) {
      const hotMarker = item.isHot ? " 🔥 HOT" : "";
      lines.push(`## ${item.dataItem}${hotMarker}`);
      lines.push("");
      lines.push(`- **Operations**: ${item.operationCount}`);
      lines.push(`- **Agents**: ${item.agents.join(", ")}`);
      lines.push(`- **Step IDs**: ${item.stepIds.join(", ")}`);
      lines.push("");
    }
  }

  const filePath = join(workspacePath, "library", "data-items.md");
  writeFileSync(filePath, lines.join("\n"), "utf-8");
  return filePath;
}

export function writeLibrarySteps(
  steps: HistoryStep[],
  phases: PhaseEntry[],
  workspacePath: string,
): string[] {
  const MAX_STEPS_PER_FILE = 150;
  const written: string[] = [];

  for (const phase of phases) {
    // Parse step range from phase stepRange string like "300-449"
    const rangeMatch = phase.stepRange.match(/^(\d+)-(\d+)$/);
    if (!rangeMatch) continue;
    const phaseStart = parseInt(rangeMatch[1], 10);
    const phaseEnd = parseInt(rangeMatch[2], 10);

    const phaseSteps = steps.filter(
      (s) => s.stepId >= phaseStart && s.stepId <= phaseEnd,
    );

    if (phaseSteps.length === 0) continue;

    // Partition into chunks of max 150
    const chunks: HistoryStep[][] = [];
    for (let i = 0; i < phaseSteps.length; i += MAX_STEPS_PER_FILE) {
      chunks.push(phaseSteps.slice(i, i + MAX_STEPS_PER_FILE));
    }

    for (const chunk of chunks) {
      const first = chunk[0];
      const last = chunk[chunk.length - 1];
      const fileName = `${phase.id}-L${String(first.stepId).padStart(3, "0")}-L${String(last.stepId).padStart(3, "0")}.md`;

      const lines: string[] = [
        `# ${phase.id}: ${phase.label}`,
        `**Range**: ${first.stepId}–${last.stepId} (${chunk.length} steps)`,
        `**Status**: ${phase.status}`,
        "",
      ];

      for (const s of chunk) {
        const errorMarker = s.isError ? " ❌" : "";
        lines.push(`## Step ${s.stepId} [${s.agent}]${errorMarker}`);
        lines.push("");
        lines.push(`- **Action**: ${s.action.slice(0, 150)}`);
        if (s.thought) {
          lines.push(`- **Thought**: ${s.thought.slice(0, 100)}`);
        }
        if (s.result) {
          lines.push(`- **Result**: ${s.result.slice(0, 200)}`);
        }
        lines.push("");
      }

      const filePath = join(workspacePath, "library", "steps", fileName);
      writeFileSync(filePath, lines.join("\n"), "utf-8");
      written.push(filePath);
    }
  }

  return written;
}

export function writeLibraryReadme(
  phase: CHIFFPhase,
  workspacePath: string,
): string {
  const phaseGuides: Record<CHIFFPhase, string> = {
    SCAN: [
      "## Your Task: SCAN",
      "",
      "You are a SCANNER. Your goal is to identify 3-5 attention zones where problems are most likely concentrated.",
      "",
      "**Recommended reading order:**",
      "1. `meta.md` — session metadata and statistics",
      "2. `skeleton.md` — phase map and hot/cold zone summary",
      "3. `signals.md` — signal anchors grouped by type and priority",
      "4. `data-items.md` — frequently modified files and assets",
      "5. `steps/P*.md` — step details (sample as needed)",
      "",
      "**Output**: Write your scan result to `output/scan-result.json`.",
      "**Optional**: Write analysis notes to `notebook/scan-notes.md`.",
    ].join("\n"),
    ZOOM: [
      "## Your Task: ZOOM",
      "",
      "You are a DEEP-DIVE ANALYST. Your goal is to construct a causal sub-graph for a specific attention zone.",
      "",
      "**Recommended reading order:**",
      "1. `notebook/scan-notes.md` — context from the SCAN phase",
      "2. `library/meta.md` — session metadata",
      "3. `library/steps/P*.md` — step details for your target zone",
      "4. `library/signals.md` — signal anchors relevant to your zone",
      "5. `library/data-items.md` — data flows involving your zone",
      "",
      "**Output**: Write your zone analysis to `output/zone-{id}-result.json`.",
      "**Optional**: Write analysis notes to `notebook/zone-{id}-analysis.md`.",
    ].join("\n"),
    SYNTHESIZE: [
      "## Your Task: SYNTHESIZE",
      "",
      "You are a CROSS-ZONE SYNTHESIZER. Your goal is to find the single root cause by cross-referencing all zone analyses.",
      "",
      "**Recommended reading order:**",
      "1. `notebook/scan-notes.md` — overall session scan findings",
      "2. `notebook/zone-*.md` — all zone analysis notes from the ZOOM phase",
      "3. `library/skeleton.md` — phase map and hot zones for global context",
      "4. `library/signals.md` — signal anchors for cross-referencing",
      "",
      "**Output**: Write your attribution to `output/attribution.json`.",
      "**Optional**: Write analysis notes to `notebook/synthesis-notes.md`.",
    ].join("\n"),
  };

  const content = [
    "# CHIFF Workspace",
    "",
    `This workspace contains session analysis data for the CHIFF causal graph pipeline.`,
    `You are currently in the **${phase}** phase.`,
    "",
    "## Directory Structure",
    "",
    "```",
    "library/         ← Pre-loaded analysis materials (read-only)",
    "  ├── README.md  ← This file",
    "  ├── meta.md    ← Session metadata and stats",
    "  ├── skeleton.md ← Phase map and hot/cold zones",
    "  ├── signals.md ← Signal anchors grouped by type",
    "  ├── data-items.md ← Frequently modified files",
    "  └── steps/     ← Step details partitioned by phase",
    "notebook/        ← Your analysis notes (read/write)",
    "output/          ← Your structured JSON output (write)",
    "```",
    "",
    phaseGuides[phase] ?? "",
    "",
    "## Tools Available",
    "",
    "- `read_file(path)` — read files from library/, notebook/, or output/",
    "- `write_file(path, content)` — write files to notebook/ or output/",
    "- `grep(pattern, path)` — search for patterns in library/ or notebook/",
    "- `glob(pattern)` — list files matching a pattern in library/ or notebook/",
    "",
  ].join("\n");

  const filePath = join(workspacePath, "library", "README.md");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// ── Orchestrator ──

export function writeLibrary(
  skeleton: SessionSkeleton,
  steps: HistoryStep[],
  ruleResult: EvalResult,
  phase: CHIFFPhase,
  workspacePath: string,
): { path: string; fileCount: number } {
  let fileCount = 0;

  writeLibraryMetadata(skeleton, workspacePath);
  fileCount++;

  writeLibrarySkeleton(skeleton, workspacePath);
  fileCount++;

  writeLibrarySignals(skeleton, workspacePath);
  fileCount++;

  writeLibraryDataItems(skeleton, workspacePath);
  fileCount++;

  const stepFiles = writeLibrarySteps(steps, skeleton.phases, workspacePath);
  fileCount += stepFiles.length;

  writeLibraryReadme(phase, workspacePath);
  fileCount++;

  return { path: workspacePath, fileCount };
}

// ── Retention ──

export function cleanOldWorkspaces(maxRetain: number = 10): number {
  const baseDir = evalBaseDir();
  if (!existsSync(baseDir)) return 0;

  const entries = readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const fullPath = join(baseDir, d.name);
      try {
        const stat = statSync(fullPath);
        return { path: fullPath, mtime: stat.mtimeMs };
      } catch {
        return { path: fullPath, mtime: 0 };
      }
    })
    .sort((a, b) => b.mtime - a.mtime); // newest first

  let removed = 0;
  for (let i = maxRetain; i < entries.length; i++) {
    try {
      rmSync(entries[i].path, { recursive: true, force: true });
      removed++;
    } catch {
      // Ignore removal failures
    }
  }

  return removed;
}
