// ── Dashboard HTML Generator ──
import type { CascadeEdge } from "./focus/types.js";
// Generates a dark-themed, self-contained HTML diagnostic dashboard.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { exec } from "node:child_process";
import { join, dirname } from "node:path";
import type { EvalResult } from "./types.js";
import type { CausalGraphSnapshot, Attribution, RecoveryArc } from "./schemas.js";


// ── Recovery Timeline Generator ──

function generateRecoveryTimelineHTML(recoveryArcs: RecoveryArc[]): string {
  if (!recoveryArcs || recoveryArcs.length === 0) return "";

  const rows = recoveryArcs.map((arc, i) => {
    const effectiveColor = arc.effective ? COLORS.ok : "rgba(210,153,29,0.5)";
    const effectiveIcon = arc.effective ? "✅" : "⚠️";
    const detectionLabel: Record<string, string> = {
      tool_error: "工具报错",
      user_complaint: "用户反馈",
      test_failure: "测试失败",
      screenshot_divergence: "截图偏离",
      self_correction: "Agent 自纠",
    };
    const detLabel = detectionLabel[arc.detectionType] ?? arc.detectionType;

    return `
    <div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:6px;padding:14px 16px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
        <span style="background:${COLORS.danger};color:#fff;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;white-space:nowrap;">🔴 Step ${arc.errorStep}</span>
        <span style="color:${COLORS.textMuted};font-size:14px;">→</span>
        <span style="background:${COLORS.warn};color:#000;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;white-space:nowrap;">🔍 Step ${arc.detectionStep}</span>
        <span style="color:${COLORS.textMuted};font-size:14px;">→</span>
        <span style="background:${effectiveColor};color:#000;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;white-space:nowrap;">${effectiveIcon} Step ${arc.correctionStep}</span>
        <span style="background:rgba(212,151,8,0.15);padding:2px 8px;border-radius:4px;font-size:11px;color:${COLORS.accent};">${detLabel}</span>
        <span style="font-size:11px;color:${COLORS.textMuted};">${arc.stepsToRecover} steps</span>
        ${arc.misdiagnosisCount > 0 ? `<span style="background:rgba(210,153,29,0.15);padding:2px 8px;border-radius:4px;font-size:11px;color:${COLORS.warn};">${arc.misdiagnosisCount} 次误判</span>` : ""}
      </div>
      <div style="font-size:13px;color:${COLORS.text};margin-bottom:4px;">
        <span style="color:${COLORS.danger};">${escapeHtml(arc.errorAgent)}</span>: ${escapeHtml(arc.errorSummary)}
        → <span style="color:${effectiveColor};">${escapeHtml(arc.correctionAgent)}</span>: ${escapeHtml(arc.correctionSummary)}
      </div>
      <div style="font-size:12px;color:${COLORS.accent};font-style:italic;padding:8px 12px;background:rgba(212,151,8,0.08);border-radius:4px;border-left:3px solid ${COLORS.accent};margin-top:8px;">
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
  ok: "#5ca860",
  warn: "#d4a017",
  danger: "#e05553",
  bg: "#1e1c19",
  card: "#282622",
  border: "#3a3732",
  text: "#e8e4dd",
  textMuted: "#8a8580",
  accent: "#d49708",
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

function generateRuleChainHTML(attribution: Attribution, rulesApplied: string[]): string {
  const ruleDescriptions: Record<string, string> = {
    "Rule1": "Control Flow / Loop adjudication — determines whether the agent entered an unjustified repair loop, or whether an action within a loop caused irreversible damage",
    "Rule2": "Data Flow traceback — traces key data from source to final consumer; identifies whether data was misinterpreted, fabricated, or misused",
    "Rule3": "Irrecoverable Point — identifies the FIRST step that made the correct path unrecoverable (not necessarily the first error)",
  };

  const ruleItems = rulesApplied.map((r) => `
    <div style="padding:8px 12px;margin:4px 0;background:${r === "Rule3" ? "rgba(224,85,83,0.15)" : "rgba(212,151,8,0.1)"};border-left:3px solid ${r === "Rule3" ? COLORS.danger : COLORS.accent};border-radius:4px;">
      <strong style="color:${COLORS.accent};font-size:13px;">${escapeHtml(r)}</strong>
      <div style="font-size:12px;color:${COLORS.textMuted};margin-top:2px;">${escapeHtml(ruleDescriptions[r] ?? "")}</div>
    </div>`).join("");

  return `
<h2>Rule Reasoning Chain</h2>
<div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:6px;padding:16px;margin-bottom:16px;">
  <div style="font-size:14px;margin-bottom:12px;">
    <strong>Root Cause</strong>: ${escapeHtml(attribution.mistakeAgent)} at Step ${attribution.mistakeStep}
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
      <span style="background:${COLORS.danger};color:#fff;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;">🔴 根因</span>
      <span style="font-family:monospace;font-size:13px;color:${COLORS.accent};">${escapeHtml(e.fromZoneId)}:${e.fromStepId}</span>
      <span style="color:${COLORS.textMuted};font-size:18px;">→</span>
      <span style="font-family:monospace;font-size:13px;">${escapeHtml(e.toZoneId)}:${e.toStepId}</span>
      <span style="background:rgba(212,151,8,0.15);padding:2px 8px;border-radius:4px;font-size:11px;color:${COLORS.accent};">${mechanismLabel}</span>
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
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Eval Dashboard — ${escapeHtml(metadata.sessionId.slice(0, 8))}</title>
<style>
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
h1 { font-size: 28px; font-weight: 600; margin-bottom: 4px; color: #e8e4dd; }
h2 { font-size: 20px; font-weight: 600; margin: 32px 0 16px; color: #e8e4dd; border-bottom: 1px solid ${COLORS.border}; padding-bottom: 8px; }
h3 { font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #e8e4dd; }
.header { background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 24px; margin-bottom: 24px; }
.header-meta { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-top: 16px; }
.meta-item { }
.meta-label { font-size: 12px; color: ${COLORS.textMuted}; text-transform: uppercase; letter-spacing: 0.5px; }
.meta-value { font-size: 14px; color: ${COLORS.text}; font-family: "SF Mono", "Fira Code", monospace; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
.stat-card { background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center; }
.stat-value { font-size: 36px; font-weight: 700; }
.stat-label { font-size: 12px; color: ${COLORS.textMuted}; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.phase-bar { display: flex; height: 32px; border-radius: 4px; overflow: hidden; margin-bottom: 16px; }
.phase-segment { display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 4px; cursor: default; }
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
    <span style="background:${COLORS.ok};color:#000;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">🤖 CHIFF Causal Graph Analysis</span>
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
</div>

<!-- Phase Timeline -->
<h2>Phase Timeline</h2>
${phases.length > 0 ? `
<div class="phase-bar">
  ${phases.map((p) => {
    const total = metadata.totalMessages || 1;
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

${result.recoveryArcs && result.recoveryArcs.length > 0 ? `<!-- Recovery Timeline -->
${generateRecoveryTimelineHTML(result.recoveryArcs)}` : ""}

<!-- Rule Reasoning Chain (LLM mode only) -->

<!-- Cascade Path (focus pipeline only) -->
${result.cascadePath ? generateCascadePathHTML(result.cascadePath) : ""}
${result.attribution ? generateRuleChainHTML(result.attribution, result.rulesApplied) : ""}

<!-- Root Causes -->
<h2>Root Cause Analysis</h2>
${rootCauses.length > 0 ? rootCauses.map((rc) => `
<div class="root-cause ${rc.severity}">
  <div class="root-cause-title">${rc.severity === "primary" ? "🔴" : "🟡"} ${escapeHtml(rc.title)}</div>
  <div class="root-cause-desc">${escapeHtml(rc.description)}</div>
  <div class="root-cause-evidence">Evidence: M${rc.evidenceIndices.map((i) => i).join(", M")}</div>
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
<h3 style="font-size:15px;font-weight:600;margin:24px 0 12px;color:#e8e4dd;">${escapeHtml(catLabels[cat] ?? cat)}</h3>
${catRules.map((r: any) => {
  const sevLabel = r.severity >= 1 ? 'ERROR' : r.severity >= 0.6 ? 'WARN' : 'INFO';
  const sevColor = r.severity >= 1 ? COLORS.danger : r.severity >= 0.6 ? COLORS.warn : COLORS.accent;
  const evidenceCount = r.evidence ? r.evidence.length : 0;
  const lastEvidence = evidenceCount > 0 ? r.evidence[r.evidence.length - 1] : null;
  const lastDate = lastEvidence?.timestamp ? new Date(lastEvidence.timestamp).toISOString().slice(0, 10) : "-";
  const mergedCount = r.mergedFrom ? r.mergedFrom.length : 0;

  return `
<div class="deviation-card" style="border-left:3px solid ${sevColor};margin-bottom:16px;">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
    <span class="badge" style="background:${sevColor};font-size:10px;padding:2px 6px;border-radius:3px;">${sevLabel}</span>
    <strong>${escapeHtml(r.id)}</strong>
    <span style="color:${COLORS.textMuted};font-size:11px;">→ ${escapeHtml(r.targetLayer)}</span>
    ${evidenceCount > 0 ? `<span style="color:${COLORS.textMuted};font-size:10px;">📊 ${evidenceCount} sessions</span>` : ""}
    ${mergedCount > 0 ? `<span style="color:${COLORS.accent};font-size:10px;" title="Merged from: ${escapeHtml((r.mergedFrom as string[]).join(", "))}">🔗 合并自 ${mergedCount} 条规则</span>` : ""}
  </div>
  <p style="color:${COLORS.textMuted};margin:0 0 6px 0;font-size:13px;">${escapeHtml(r.abstract)}</p>
  ${r.rawDescription ? `
  <details style="margin-bottom:8px;">
    <summary style="font-size:11px;color:${COLORS.accent};cursor:pointer;">📝 详细描述</summary>
    <p style="font-size:12px;color:${COLORS.textMuted};margin:4px 0;padding:8px;background:rgba(212,151,8,0.05);border-radius:4px;white-space:pre-wrap;">${escapeHtml(r.rawDescription)}</p>
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

export function generateDashboard(result: EvalResult, outputPath: string): string {
  const html = generateDashboardHTML(result);
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(outputPath, html, "utf8");
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
