// ── Dashboard HTML Generator ──
import type { CascadeEdge } from "./focus/types.js";
// Generates a theme-aware, self-contained HTML diagnostic dashboard.

import { writeFileSync, mkdirSync, existsSync, renameSync, rmSync } from "node:fs";
import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { serializeArtifactThemeVariables } from "../ui/shared/artifact-theme.js";
import type { EvalResult } from "./types.js";
import type { ChiefAttribution } from "./chief/types.js";

type DashboardAttribution = NonNullable<EvalResult["attribution"]>;
type DashboardRecoveryArc = NonNullable<EvalResult["recoveryArcs"]>[number];


// ── Recovery Timeline Generator ──

function generateRecoveryTimelineHTML(recoveryArcs: DashboardRecoveryArc[]): string {
  if (!recoveryArcs || recoveryArcs.length === 0) return "";

  const rows = recoveryArcs.map((arc) => {
    const effectiveColor = arc.effective
      ? COLORS.ok
      : "color-mix(in srgb, var(--warning) 50%, transparent)";
    const effectiveIcon = arc.effective ? "✅" : "⚠️";
    const detectionLabel: Record<string, string> = {
      tool_error: "工具报错",
      user_complaint: "用户反馈",
      test_failure: "测试失败",
      screenshot_divergence: "截图偏离",
      self_correction: "Agent 自纠",
      agent_review: "Agent 审查",
    };
    const detLabel = detectionLabel[arc.detectionType] ?? arc.detectionType;

    return `
    <div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:6px;padding:14px 16px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
        <span style="background:${COLORS.danger};color:${COLORS.statusText};padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;white-space:nowrap;">🔴 Step ${arc.errorStep}</span>
        <span style="color:${COLORS.textMuted};font-size:14px;">→</span>
        <span style="background:${COLORS.warn};color:${COLORS.statusText};padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;white-space:nowrap;">🔍 Step ${arc.detectionStep}</span>
        <span style="color:${COLORS.textMuted};font-size:14px;">→</span>
        <span style="background:${effectiveColor};color:${COLORS.statusText};padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;white-space:nowrap;">${effectiveIcon} Step ${arc.correctionStep}</span>
        <span style="background:color-mix(in srgb, var(--accent) 15%, transparent);padding:2px 8px;border-radius:4px;font-size:11px;color:${COLORS.accent};">${detLabel}</span>
        <span style="font-size:11px;color:${COLORS.textMuted};">${arc.stepsToRecover} steps</span>
        ${arc.misdiagnosisCount > 0 ? `<span style="background:color-mix(in srgb, var(--warning) 15%, transparent);padding:2px 8px;border-radius:4px;font-size:11px;color:${COLORS.warn};">${arc.misdiagnosisCount} 次误判</span>` : ""}
      </div>
      <div style="font-size:13px;color:${COLORS.text};margin-bottom:4px;">
        <span style="color:${COLORS.danger};">${escapeHtml(arc.errorAgent)}</span>: ${escapeHtml(arc.errorSummary)}
        → <span style="color:${effectiveColor};">${escapeHtml(arc.correctionAgent)}</span>: ${escapeHtml(arc.correctionSummary)}
      </div>
      <div style="font-size:12px;color:${COLORS.accent};font-style:italic;padding:8px 12px;background:color-mix(in srgb, var(--accent) 8%, transparent);border-radius:4px;border-left:3px solid ${COLORS.accent};margin-top:8px;">
        💡 根因假说: ${escapeHtml(arc.rootCauseHypothesis)}
      </div>
    </div>`;
  }).join("");

  return `
<h2>Recovery Timeline — 恢复时间线</h2>
<div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:6px;padding:16px;margin-bottom:16px;">
  <div style="font-size:13px;color:${COLORS.textMuted};margin-bottom:12px;">
    错误恢复轨迹 — 展示 Agent 从犯错到纠正的完整弧线
  </div>
  ${rows}
</div>`;
}

// ── HTML Escape ──

export function escapeHtml(text: string | null | undefined): string {
  if (text == null) return "";
  const s = String(text);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── Color utilities ──

const COLORS = {
  ok: "var(--success)",
  warn: "var(--warning)",
  danger: "var(--error)",
  bg: "var(--bg)",
  card: "var(--surface)",
  border: "var(--border)",
  text: "var(--text)",
  textMuted: "var(--muted)",
  accent: "var(--accent)",
  statusText: "var(--status-text)",
};

function statusColor(status: "ok" | "warn" | "danger"): string {
  return COLORS[status];
}

function statusEmoji(status: "ok" | "warn" | "danger"): string {
  switch (status) {
    case "ok": return "✓";
    case "warn": return "⚠";
    case "danger": return "✗";
  }
}

function shortAgentId(agentId: string): string {
  return agentId.startsWith("agent-")
    ? agentId.slice(6, 12)
    : agentId.startsWith("main-")
      ? agentId.slice(5, 11)
      : agentId.slice(0, 6);
}

function isChiefAttribution(
  attribution: DashboardAttribution,
): attribution is ChiefAttribution {
  return "mistakeAgentId" in attribution;
}

function generateEvidenceHTML(result: EvalResult): string {
  const evidence = result.trajectoryEvidence;
  if (!evidence) return "";
  const actors = new Map((result.actors ?? []).map((actor) => [actor.agentId, actor]));
  const affected = evidence.affectedAgentIds.map((agentId) => {
    const actor = actors.get(agentId);
    return actor
      ? `${escapeHtml(actor.application)} (${escapeHtml(shortAgentId(agentId))}, ${actor.evidenceQuality})`
      : escapeHtml(shortAgentId(agentId));
  });
  const warning = evidence.completeness === "partial"
    ? `<div style="margin-top:10px;color:${COLORS.warn};font-size:12px;">
        Partial evidence limits Step-level attribution for: ${affected.join(", ") || "unknown actors"}.
      </div>`
    : `<div style="margin-top:10px;color:${COLORS.ok};font-size:12px;">All indexed SubAgent transcripts are available.</div>`;
  return `
<div class="phase-detail" data-evidence-status="${evidence.completeness}">
  <div class="phase-header">
    <span class="phase-label">Transcript Evidence: ${escapeHtml(evidence.completeness)}</span>
    <span class="phase-range">${evidence.fullTranscripts} full / ${evidence.summaryTranscripts} summary / ${evidence.missingTranscripts} missing</span>
  </div>
  ${warning}
</div>`;
}

function generateProcessLanesHTML(result: EvalResult): string {
  const actors = result.actors ?? [];
  if (actors.length === 0) return "";
  const steps = result.trajectory?.steps ?? [];
  const maxStep = Math.max(0, ...steps.map((step) => step.stepId));
  const denominator = Math.max(1, maxStep + 1);
  const lanes = actors.map((actor) => {
    const actorSteps = steps.filter((step) => step.agentId === actor.agentId);
    const ids = actorSteps.map((step) => step.stepId);
    const start = ids.length > 0 ? Math.min(...ids) : undefined;
    const end = ids.length > 0 ? Math.max(...ids) : undefined;
    const left = start === undefined ? 0 : (start / denominator) * 100;
    const width = start === undefined || end === undefined
      ? 100
      : Math.max(2, ((end - start + 1) / denominator) * 100);
    const state = actor.state ?? (actor.role === "main" ? "main" : "unknown");
    const duration = actor.startedAt !== undefined && actor.endedAt !== undefined
      ? `${Math.max(0, actor.endedAt - actor.startedAt)} ms`
      : "duration unavailable";
    const range = start === undefined ? "no internal Steps" : `Steps ${start}-${end}`;
    const color = actor.role === "main" ? COLORS.accent : COLORS.ok;
    return `
  <div class="process-lane" data-agent-id="${escapeHtml(actor.agentId)}" data-application="${escapeHtml(actor.application)}">
    <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:6px;">
      <div>
        <strong>${escapeHtml(actor.application)}</strong>
        <span style="font-family:monospace;color:${COLORS.accent};">(${escapeHtml(shortAgentId(actor.agentId))})</span>
        <span style="font-size:11px;color:${COLORS.textMuted};">${actor.role} · ${escapeHtml(actor.evidenceQuality)}</span>
      </div>
      <span style="font-size:11px;color:${COLORS.textMuted};">${escapeHtml(state)} · ${range} · ${duration}</span>
    </div>
    <div style="position:relative;height:12px;background:${COLORS.bg};border-radius:6px;overflow:hidden;">
      <div style="position:absolute;left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;height:100%;background:${color};border-radius:6px;"></div>
    </div>
  </div>`;
  }).join("");
  const mainOnly = actors.every((actor) => actor.role === "main")
    ? `<div class="no-issues">Main-only trajectory: no task SubAgents were recorded.</div>`
    : "";
  return `
<h2>Agent Process Lanes</h2>
<div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:8px;padding:16px;">
  ${mainOnly}
  ${lanes}
</div>`;
}

function generateDependencyHTML(result: EvalResult): string {
  const edges = [
    ...(result.trajectory?.controlEdges ?? []),
    ...(result.trajectory?.dataEdges ?? []),
  ].filter((edge) => edge.fromAgentId !== edge.toAgentId);
  if (edges.length === 0) return "";
  const actors = new Map((result.actors ?? []).map((actor) => [actor.agentId, actor]));
  const actorLabel = (agentId: string) => {
    const actor = actors.get(agentId);
    return actor
      ? `${actor.application} (${shortAgentId(agentId)})`
      : shortAgentId(agentId);
  };
  return `
<h3>Cross-Agent Dependencies</h3>
<div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:6px;padding:12px;margin-bottom:16px;">
${edges.map((edge) => `
  <div data-edge-type="${edge.type}" style="font-size:12px;padding:5px 8px;color:${COLORS.textMuted};">
    <span style="color:${COLORS.text};">${escapeHtml(actorLabel(edge.fromAgentId))}</span>
    <span style="color:${COLORS.accent};"> --${escapeHtml(edge.type)}--&gt; </span>
    <span style="color:${COLORS.text};">${escapeHtml(actorLabel(edge.toAgentId))}</span>
    · Step ${edge.fromStep} to Step ${edge.toStep} · ${escapeHtml(edge.label)}
  </div>`).join("")}
</div>`;
}

function generateBacktrackingHTML(result: EvalResult): string {
  const attribution = result.attribution;
  if (!attribution || !isChiefAttribution(attribution) || !attribution.screeningStages) {
    return "";
  }
  const screening = attribution.screeningStages;
  const steps = new Map((result.trajectory?.steps ?? []).map((step) => [step.stepId, step]));
  const candidateRows = screening.stepCandidates.map((candidate) => {
    const step = steps.get(Number(candidate.id));
    const actor = step
      ? `${step.application} (${shortAgentId(step.agentId)})`
      : "unknown actor";
    return `<div style="font-size:12px;padding:4px 0;color:${COLORS.textMuted};">
      Step ${escapeHtml(candidate.id)} · ${escapeHtml(actor)} · ${(candidate.score * 100).toFixed(0)}% · ${escapeHtml(candidate.reason)}
    </div>`;
  }).join("");
  return `
<h2>Hierarchical Backtracking</h2>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:12px;">
  <div class="stat-card"><div class="stat-value">${screening.subtaskCandidates.length}/${screening.screenedSubtasks.length}</div><div class="stat-label">Subtask Candidates</div></div>
  <div class="stat-card"><div class="stat-value">${screening.agentCandidates.length}/${screening.screenedAgentIds.length}</div><div class="stat-label">Agent Candidates</div></div>
  <div class="stat-card"><div class="stat-value">${screening.stepCandidates.length}</div><div class="stat-label">Step Candidates</div></div>
</div>
<div class="phase-detail">${candidateRows || '<div class="no-issues">No Step-level candidate was justified.</div>'}</div>`;
}

function generateAttributionHTML(result: EvalResult): string {
  const attribution = result.attribution;
  if (!attribution || !isChiefAttribution(attribution)) return "";
  const location = attribution.mistakeStep === null
    ? `${attribution.granularity} granularity`
    : `Step ${attribution.mistakeStep}`;
  return `
<h2>CHIEF Attribution</h2>
<div class="root-cause" data-agent-id="${escapeHtml(attribution.mistakeAgentId)}">
  <div class="root-cause-title">
    ${escapeHtml(attribution.mistakeApplication)}
    <span style="font-family:monospace;color:${COLORS.accent};">(${escapeHtml(shortAgentId(attribution.mistakeAgentId))})</span>
    @ ${escapeHtml(location)}
  </div>
  <div class="root-cause-desc">${escapeHtml(attribution.reason)}</div>
  <div class="root-cause-evidence">
    Confidence ${(attribution.confidence * 100).toFixed(0)}% · ${escapeHtml(attribution.granularity)} granularity · ${escapeHtml(attribution.evidenceQuality)} evidence · ${escapeHtml(attribution.mistakeSubtaskId)}
  </div>
</div>`;
}

// ── Causal Graph SVG Generator ──

function generateCausalGraphHTML(result: EvalResult): string {
  const graph = result.causalGraph;
  if (!graph) return "";
  const subs = graph.subtasks;
  if (subs.length === 0) return "";

  const barWidth = 100 / subs.length;
  const barHTML = subs.map((s) => {
    const color = s.status === "danger" ? COLORS.danger : s.status === "warn" ? COLORS.warn : COLORS.ok;
    return `<div style="background:${color};width:${barWidth.toFixed(1)}%;min-width:80px;padding:6px 4px;text-align:center;font-size:10px;border-right:1px solid ${COLORS.bg};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(s.name)} (${s.stepRange})\nGoal: ${escapeHtml(s.oracleGoal)}\nAgents: ${s.agentCount}\n${escapeHtml(s.loopSummary)}">${escapeHtml(s.name)}</div>`;
  }).join("");

  const edgeList = graph.subtaskEdges.map((e) => `
    <div style="font-size:12px;padding:2px 8px;color:${COLORS.textMuted};">
      ${escapeHtml(e.src)} → ${escapeHtml(e.dst)} [${escapeHtml(e.type)}, strength=${e.strength.toFixed(2)}]
      ${e.keyDataTransfers.length > 0 ? ` · data: ${e.keyDataTransfers.map(escapeHtml).join(", ")}` : ""}
      ${e.failureModeSummary ? ` · ⚠ ${escapeHtml(e.failureModeSummary)}` : ""}
    </div>`).join("");
  const agentNodes = graph.agentSummaries.map((agent) => `
    <div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:6px;padding:10px 12px;">
      <strong>${escapeHtml(agent.agent)}</strong>
      <div style="font-size:11px;color:${COLORS.textMuted};">${escapeHtml(agent.subtaskId)} · Steps ${agent.stepIds.join(", ")}</div>
      <div style="font-size:12px;color:${COLORS.textMuted};margin-top:4px;">${escapeHtml(agent.keyAction)}</div>
    </div>`).join("");

  const flowRows = graph.dataFlows.slice(0, 10).map((f) => `
    <tr>
      <td style="font-family:monospace;font-size:12px;padding:4px 8px;border-bottom:1px solid ${COLORS.border};">${escapeHtml(f.dataItem)}</td>
      <td style="font-size:12px;padding:4px 8px;border-bottom:1px solid ${COLORS.border};color:${COLORS.textMuted};">${escapeHtml(f.path)}</td>
      <td style="font-size:12px;padding:4px 8px;border-bottom:1px solid ${COLORS.border};color:${f.correctness === "correct" ? COLORS.ok : COLORS.warn};">${escapeHtml(f.correctness)}</td>
    </tr>`).join("");

  return `
<h2>Causal Graph</h2>
<div class="phase-bar" style="margin-bottom:8px;">
  ${barHTML}
</div>

<h3>Agent Nodes</h3>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-bottom:16px;">
  ${agentNodes || '<div class="no-issues">No Agent nodes</div>'}
</div>

<h3>Subtask Dependencies</h3>
<div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:6px;padding:12px;margin-bottom:16px;">
  ${edgeList || '<div class="no-issues">No edge data</div>'}
</div>

<h3>Data Flow Paths</h3>
<div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:6px;overflow-x:auto;margin-bottom:16px;">
  <table style="width:100%;border-collapse:collapse;">
    <tr style="background:${COLORS.bg};">
      <th style="text-align:left;padding:8px;font-size:12px;color:${COLORS.textMuted};border-bottom:1px solid ${COLORS.border};">Data Item</th>
      <th style="text-align:left;padding:8px;font-size:12px;color:${COLORS.textMuted};border-bottom:1px solid ${COLORS.border};">Path</th>
      <th style="text-align:left;padding:8px;font-size:12px;color:${COLORS.textMuted};border-bottom:1px solid ${COLORS.border};">Correctness</th>
    </tr>
    ${flowRows || '<tr><td colspan="3" style="padding:12px;text-align:center;color:${COLORS.textMuted};">No data flows tracked</td></tr>'}
  </table>
</div>
`;
}

// ── Rule Chain Generator ──

function generateRuleChainHTML(attribution: DashboardAttribution, rulesApplied: string[]): string {
  const ruleDescriptions: Record<string, string> = {
    "Rule1": "Control Flow / Loop adjudication — determines whether the agent entered an unjustified repair loop, or whether an action within a loop caused irreversible damage",
    "Rule2": "Data Flow traceback — traces key data from source to final consumer; identifies whether data was misinterpreted, fabricated, or misused",
    "Rule3": "Irrecoverable Point — identifies the FIRST step that made the correct path unrecoverable (not necessarily the first error)",
  };

  const ruleItems = rulesApplied.map((r) => `
    <div style="padding:8px 12px;margin:4px 0;background:${r === "Rule3" ? "color-mix(in srgb, var(--error) 15%, transparent)" : "color-mix(in srgb, var(--accent) 10%, transparent)"};border-left:3px solid ${r === "Rule3" ? COLORS.danger : COLORS.accent};border-radius:4px;">
      <strong style="color:${COLORS.accent};font-size:13px;">${escapeHtml(r)}</strong>
      <div style="font-size:12px;color:${COLORS.textMuted};margin-top:2px;">${escapeHtml(ruleDescriptions[r] ?? "")}</div>
    </div>`).join("");

  return `
<h2>Rule Reasoning Chain</h2>
<div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:6px;padding:16px;margin-bottom:16px;">
  <div style="font-size:14px;margin-bottom:12px;">
    <strong>Root Cause</strong>: ${escapeHtml(attribution.mistakeAgent)} at ${attribution.mistakeStep === null ? "Agent granularity" : `Step ${attribution.mistakeStep}`}
  </div>
  <div style="font-size:13px;color:${COLORS.textMuted};margin-bottom:16px;">
    ${escapeHtml(attribution.reason)}
  </div>
  ${ruleItems}
</div>
`;
}

// ── Cascade Path Generator ──

const CASCADE_MECHANISM_LABELS: Record<string, string> = {
  data_contamination: "数据污染",
  irreversible_lock_in: "不可逆锁定",
  perception_blind_spot: "感知盲区",
  repair_cascade: "修复连锁",
  taste_drift_propagation: "品味漂移传播",
};

function generateCascadePathHTML(cascadePath: CascadeEdge[]): string {
  if (cascadePath.length === 0) return "";

  const edges = cascadePath.map((e) => {
    const mechanismLabel = CASCADE_MECHANISM_LABELS[e.mechanism] ?? e.mechanism;
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:6px;margin-bottom:8px;">
      <span style="background:${COLORS.danger};color:${COLORS.statusText};padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;">🔴 根因</span>
      <span style="font-family:monospace;font-size:13px;color:${COLORS.accent};">${escapeHtml(e.fromZoneId)}:${e.fromStepId}</span>
      <span style="color:${COLORS.textMuted};font-size:18px;">→</span>
      <span style="font-family:monospace;font-size:13px;">${escapeHtml(e.toZoneId)}:${e.toStepId}</span>
      <span style="background:color-mix(in srgb, var(--accent) 15%, transparent);padding:2px 8px;border-radius:4px;font-size:11px;color:${COLORS.accent};">${mechanismLabel}</span>
      <span style="font-size:11px;color:${COLORS.textMuted};">数据: ${escapeHtml(e.dataItem)}</span>
    </div>`;
  }).join("");

  return `
<h2>级联路径 (Cascade Path)</h2>
<div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:6px;padding:16px;margin-bottom:16px;">
  <div style="font-size:13px;color:${COLORS.textMuted};margin-bottom:12px;">
    错误传播路径 — 展示根因如何从源 Zone 扩散到其他 Zone
  </div>
  ${edges}
</div>`;
}

// ── HTML Template ──

export function generateDashboardHTML(result: EvalResult): string {
  const { metadata, stats, phases, deviations, rootCauses, rules, timeline } = result;

  return `<!DOCTYPE html>
<html lang="zh-CN" data-dscode-theme-contract="1">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Eval Dashboard — ${escapeHtml(metadata.sessionId.slice(0, 8))}</title>
<style>
:root {
  color-scheme: light;
${serializeArtifactThemeVariables("light", "  ")}
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
${serializeArtifactThemeVariables("dark", "    ")}
  }
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  background: ${COLORS.bg};
  color: ${COLORS.text};
  line-height: 1.6;
  padding: 32px;
  max-width: 1200px;
  margin: 0 auto;
}
h1 { font-size: 28px; font-weight: 600; margin-bottom: 4px; color: ${COLORS.text}; }
h2 { font-size: 20px; font-weight: 600; margin: 32px 0 16px; color: ${COLORS.text}; border-bottom: 1px solid ${COLORS.border}; padding-bottom: 8px; }
h3 { font-size: 16px; font-weight: 600; margin-bottom: 8px; color: ${COLORS.text}; }
.header { background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 24px; margin-bottom: 24px; }
.header-meta { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-top: 16px; }
.meta-item { }
.meta-label { font-size: 12px; color: ${COLORS.textMuted}; text-transform: uppercase; letter-spacing: 0.5px; }
.meta-value { font-size: 14px; color: ${COLORS.text}; font-family: "SF Mono", "Fira Code", monospace; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
.stat-card { background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center; }
.stat-value { font-size: 36px; font-weight: 700; }
.stat-label { font-size: 12px; color: ${COLORS.textMuted}; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.process-lane { padding: 12px 0; border-bottom: 1px solid ${COLORS.border}; }
.process-lane:last-child { border-bottom: 0; }
.phase-bar { display: flex; height: 32px; border-radius: 4px; overflow: hidden; margin-bottom: 16px; }
.phase-segment { display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; color: ${COLORS.statusText}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 4px; cursor: default; }
.phase-segment:hover { filter: brightness(1.2); }
.phase-detail { background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 6px; padding: 16px; margin-bottom: 12px; }
.phase-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.phase-badge { display: inline-block; width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.phase-label { font-weight: 600; font-size: 14px; }
.phase-range { font-size: 12px; color: ${COLORS.textMuted}; }
.phase-summary { font-size: 13px; color: ${COLORS.textMuted}; margin-top: 4px; }
.root-cause { background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-left: 3px solid ${COLORS.danger}; border-radius: 6px; padding: 16px; margin-bottom: 12px; }
.root-cause.secondary { border-left-color: ${COLORS.warn}; }
.root-cause-title { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
.root-cause-desc { font-size: 13px; color: ${COLORS.textMuted}; margin-bottom: 8px; }
.root-cause-evidence { font-size: 12px; color: ${COLORS.accent}; font-family: "SF Mono", "Fira Code", monospace; }
.suggestion-item { background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 6px; padding: 14px 16px; margin-bottom: 8px; font-size: 14px; display: flex; align-items: flex-start; gap: 10px; }
.suggestion-num { color: ${COLORS.accent}; font-weight: 600; flex-shrink: 0; }
.timeline { position: relative; padding-left: 24px; }
.timeline::before { content: ""; position: absolute; left: 8px; top: 0; bottom: 0; width: 2px; background: ${COLORS.border}; }
.timeline-event { position: relative; margin-bottom: 10px; padding: 8px 12px; background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 6px; font-size: 13px; }
.timeline-dot { position: absolute; left: -20px; top: 12px; width: 10px; height: 10px; border-radius: 50%; }
.no-issues { text-align: center; padding: 32px; color: ${COLORS.textMuted}; font-size: 15px; }
.footer { text-align: center; margin-top: 48px; padding-top: 16px; border-top: 1px solid ${COLORS.border}; font-size: 12px; color: ${COLORS.textMuted}; }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <h1>${escapeHtml(metadata.title)}</h1>
  <div style="font-size:13px;color:${COLORS.textMuted};font-family:monospace;margin-top:4px;">
    ${escapeHtml(metadata.sessionId)}
  </div>
  <div style="margin-top:8px;">
    <span style="background:${COLORS.ok};color:${COLORS.statusText};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">CHIEF Multi-Agent Causal Analysis</span>
  </div>
  <div class="header-meta">
    <div class="meta-item">
      <div class="meta-label">Model</div>
      <div class="meta-value">${escapeHtml(metadata.model)}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Messages</div>
      <div class="meta-value">${metadata.totalMessages}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Duration</div>
      <div class="meta-value">${escapeHtml(metadata.duration)}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Started</div>
      <div class="meta-value">${escapeHtml(metadata.startedAt)}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Ended</div>
      <div class="meta-value">${escapeHtml(metadata.endedAt)}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Project</div>
      <div class="meta-value">${escapeHtml(metadata.projectPath)}</div>
    </div>
  </div>
</div>

<!-- Stats -->
<h2>Summary</h2>
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-value" style="color:${COLORS.accent}">${metadata.totalMessages}</div>
    <div class="stat-label">Total Messages</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color:${COLORS.accent}">${stats.toolCalls}</div>
    <div class="stat-label">Tool Calls</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color:${parseFloat(stats.errorRate) > 15 ? COLORS.danger : parseFloat(stats.errorRate) > 5 ? COLORS.warn : COLORS.ok}">${stats.errorRate}</div>
    <div class="stat-label">Error Rate</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color:${COLORS.accent}">${stats.screenshotsTaken}</div>
    <div class="stat-label">Screenshots</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color:${stats.userComplaints > 0 ? COLORS.warn : COLORS.ok}">${stats.userComplaints}</div>
    <div class="stat-label">User Complaints</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color:${deviations.length > 0 ? COLORS.warn : COLORS.ok}">${deviations.length}</div>
    <div class="stat-label">Deviations</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color:${rules.length > 0 ? COLORS.warn : COLORS.ok}">${rules.length}</div>
    <div class="stat-label">Triggered Rules</div>
  </div>
  ${result.agentStats ? `
  <div class="stat-card">
    <div class="stat-value" style="color:${COLORS.accent}">${result.agentStats.totalActors}</div>
    <div class="stat-label">Agents / ${result.agentStats.applications} Apps</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color:${COLORS.ok}">${result.agentStats.processSuccessRate}</div>
    <div class="stat-label">Process Success</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color:${result.agentStats.missingTranscripts > 0 ? COLORS.warn : COLORS.ok}">${result.agentStats.fullTranscripts}/${result.agentStats.summaryTranscripts}/${result.agentStats.missingTranscripts}</div>
    <div class="stat-label">Full / Summary / Missing</div>
  </div>` : ""}
</div>

${generateEvidenceHTML(result)}
${generateProcessLanesHTML(result)}

<!-- Phase Timeline -->
<h2>Phase Timeline</h2>
${phases.length > 0 ? `
<div class="phase-bar">
  ${phases.map((p) => {
    const total = result.trajectory?.steps.length || metadata.totalMessages || 1;
    const width = ((p.endIdx - p.startIdx + 1) / total * 100).toFixed(1);
    return `<div class="phase-segment" style="width:${width}%;background:${statusColor(p.status)};" title="${escapeHtml(p.label)} (M${p.startIdx}–M${p.endIdx})">${escapeHtml(p.label)}</div>`;
  }).join("")}
</div>
` : ""}
${phases.map((p) => `
<div class="phase-detail">
  <div class="phase-header">
    <span class="phase-badge" style="background:${statusColor(p.status)}"></span>
    <span class="phase-label">${statusEmoji(p.status)} ${escapeHtml(p.label)}</span>
    <span class="phase-range">M${p.startIdx} – M${p.endIdx}</span>
  </div>
  <div class="phase-summary">${escapeHtml(p.summary)} · ${p.toolCalls.total} tool calls, ${p.toolCalls.errors} errors</div>
</div>
`).join("")}

<!-- Causal Graph (LLM mode only) -->
${result.causalGraph ? generateCausalGraphHTML(result) : ""}
${generateDependencyHTML(result)}

${result.recoveryArcs && result.recoveryArcs.length > 0 ? `<!-- Recovery Timeline -->
${generateRecoveryTimelineHTML(result.recoveryArcs)}` : ""}

<!-- Rule Reasoning Chain (LLM mode only) -->
${generateBacktrackingHTML(result)}
${generateAttributionHTML(result)}

<!-- Cascade Path (focus pipeline only) -->
${result.cascadePath ? generateCascadePathHTML(result.cascadePath) : ""}
${result.attribution ? generateRuleChainHTML(result.attribution, result.rulesApplied) : ""}

<!-- Root Causes -->
<h2>Root Cause Analysis</h2>
${rootCauses.length > 0 ? rootCauses.map((rc) => `
<div class="root-cause ${rc.severity}">
  <div class="root-cause-title">${rc.severity === "primary" ? "🔴" : "🟡"} ${escapeHtml(rc.title)}</div>
  <div class="root-cause-desc">${escapeHtml(rc.description)}</div>
  <div class="root-cause-evidence">${rc.evidenceIndices.length > 0 ? `Evidence: Step ${rc.evidenceIndices.join(", Step ")}` : "Evidence: Agent-level attribution"}</div>
</div>
`).join("") : `<div class="no-issues">No significant issues detected ✓</div>`}

<!-- Deviations -->
${deviations.length > 0 ? `
<h2>Keyword Deviations</h2>
${deviations.map((d) => `
<div class="phase-detail">
  <div class="phase-header">
    <span class="phase-badge" style="background:${d.severity === "high" ? COLORS.danger : d.severity === "medium" ? COLORS.warn : COLORS.ok}"></span>
    <span class="phase-label">M${d.messageIdx}</span>
    <span class="phase-range">severity: ${d.severity}</span>
  </div>
  <div class="phase-summary">
    Target: ${escapeHtml(d.targetKeyword)}<br>
    Screenshot: ${escapeHtml(d.screenshotKeyword)}<br>
    ${escapeHtml(d.description)}
  </div>
</div>
`).join("")}
` : ""}

<!-- Harness Rules -->
<h2>Harness Rules — Agent 配置优化建议</h2>
${(() => {
  if (rules.length === 0) return `<div class="suggestion-item"><span style="color:${COLORS.ok};">✅ 未检测到 Agent 配置问题</span></div>`;

  // Group rules by category
  const catLabels: Record<string, string> = { identity: "# Identity / Soul", tool_use: "# Tool Use Rules", tool_registry: "Tool Registry", agents_md: "# AGENTS.md", skill: "# Skills", other: "Other" };
  const grouped: Record<string, typeof rules> = {};
  for (const r of rules) {
    const cat = (r.category as string) || "other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(r);
  }

  return Object.entries(grouped).map(([cat, catRules]) => `
<h3 style="font-size:15px;font-weight:600;margin:24px 0 12px;color:${COLORS.text};">${escapeHtml(catLabels[cat] ?? cat)}</h3>
${catRules.map((r: any) => {
  const sevLabel = r.severity >= 1 ? 'ERROR' : r.severity >= 0.6 ? 'WARN' : 'INFO';
  const sevColor = r.severity >= 1 ? COLORS.danger : r.severity >= 0.6 ? COLORS.warn : COLORS.accent;
  const evidenceCount = r.evidence ? r.evidence.length : 0;
  const mergedCount = r.mergedFrom ? r.mergedFrom.length : 0;

  return `
<div class="deviation-card" style="border-left:3px solid ${sevColor};margin-bottom:16px;">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
    <span class="badge" style="background:${sevColor};color:${COLORS.statusText};font-size:10px;padding:2px 6px;border-radius:3px;">${sevLabel}</span>
    <strong>${escapeHtml(r.id)}</strong>
    <span style="color:${COLORS.textMuted};font-size:11px;">→ ${escapeHtml(r.targetLayer)}</span>
    ${r.targetScope === "application" ? `<span style="color:${COLORS.accent};font-size:10px;">Application: ${escapeHtml(r.targetApplication ?? "unknown")}</span>` : `<span style="color:${COLORS.textMuted};font-size:10px;">Shared Harness</span>`}
    ${evidenceCount > 0 ? `<span style="color:${COLORS.textMuted};font-size:10px;">📊 ${evidenceCount} sessions</span>` : ""}
    ${mergedCount > 0 ? `<span style="color:${COLORS.accent};font-size:10px;" title="Merged from: ${escapeHtml((r.mergedFrom as string[]).join(", "))}">🔗 合并自 ${mergedCount} 条规则</span>` : ""}
  </div>
  <p style="color:${COLORS.textMuted};margin:0 0 6px 0;font-size:13px;">${escapeHtml(r.abstract)}</p>
  ${r.rawDescription ? `
  <details style="margin-bottom:8px;">
    <summary style="font-size:11px;color:${COLORS.accent};cursor:pointer;">📝 详细描述</summary>
    <p style="font-size:12px;color:${COLORS.textMuted};margin:4px 0;padding:8px;background:color-mix(in srgb, var(--accent) 5%, transparent);border-radius:4px;white-space:pre-wrap;">${escapeHtml(r.rawDescription)}</p>
  </details>` : ""}
  ${r.severity >= 1 ? `<div style="font-size:11px;color:${COLORS.danger};margin-bottom:6px;">⚠ 建议持久化到 Agent 配置 (${escapeHtml(r.targetLayer)})</div>` : ""}
  <div style="background:${COLORS.card};border-radius:4px;padding:10px 12px;">
    <div style="font-size:11px;color:${COLORS.warn};margin-bottom:4px;">💡 建议${r.suggestion.action === 'modify' ? '修改' : r.suggestion.action === 'add' ? '新增' : r.suggestion.action === 'remove' ? '移除' : '调整'}</div>
    <div style="font-size:13px;line-height:1.5;margin-bottom:6px;"><strong>${escapeHtml(r.suggestion.proposed)}</strong></div>
    <div style="font-size:11px;color:${COLORS.textMuted};">📋 ${escapeHtml(r.suggestion.rationale)}</div>
  </div>
</div>`;}).join("")}
`).join("");
})() }

<!-- Timeline -->
<h2>Event Timeline</h2>
<div class="timeline">
${timeline.map((e) => `
  <div class="timeline-event">
    <div class="timeline-dot" style="background:${e.severity ? statusColor(e.severity) : COLORS.accent}"></div>
    <strong style="font-family:monospace;font-size:12px;">M${e.messageIdx}</strong>
    <span style="font-size:11px;color:${COLORS.textMuted};margin-left:6px;">[${e.type}]</span>
    <span style="margin-left:6px;">${escapeHtml(e.label)}</span>
  </div>
`).join("")}
</div>

<div class="footer">
  Generated by dscode /eval · ${new Date().toISOString().replace("T", " ").slice(0, 19)}
</div>

</body>
</html>`;
}

// ── File generation ──

export function writeDashboardArtifacts(
  html: string,
  outputPaths: readonly string[],
): void {
  for (const outputPath of outputPaths) {
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryPath, html, "utf8");
      renameSync(temporaryPath, outputPath);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }
}

export function generateDashboardArtifacts(
  result: EvalResult,
  outputPaths: readonly string[],
): string {
  const html = generateDashboardHTML(result);
  writeDashboardArtifacts(html, outputPaths);
  return html;
}

export function generateDashboard(result: EvalResult, outputPath: string): string {
  generateDashboardArtifacts(result, [outputPath]);
  return outputPath;
}

// ── Browser open ──

export function openDashboard(filePath: string): void {
  const platform = process.platform;
  let cmd: string;
  if (platform === "darwin") {
    cmd = `open "${filePath}"`;
  } else if (platform === "linux") {
    cmd = `xdg-open "${filePath}"`;
  } else if (platform === "win32") {
    cmd = `start "" "${filePath}"`;
  } else {
    return;
  }

  exec(cmd, (err) => {
    if (err) {
      // Graceful fallback: don't throw
    }
  });
}
