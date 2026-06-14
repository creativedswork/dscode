// ── Session Analyzer (Rule Engine) ──
// Local rule-based analysis: metadata, tool stats, phase detection,
// keyword deviation, root cause inference, and suggestions.
// Also serves as fallback when LLM analysis is unavailable.

import type { SerializedSession, SessionMetadata } from "../session/types.js";
import type {
  EvalResult,
  PhaseInfo,
  DeviationPoint,
  RootCause,
  SessionMeta,
  ToolStats,
  TimelineEvent,
  CompactMessage,
} from "./types.js";

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

function getMessageRole(msg: any): string {
  return msg?.role ?? "unknown";
}

function getMessageContent(msg: any): string {
  const c = msg?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const textBlock = c.find((b: any) => b.type === "text");
    return textBlock?.text ?? "";
  }
  return "";
}

function getThinking(msg: any): string {
  // Thinking may be top-level or inside content blocks
  if (typeof msg?.thinking === "string") return msg.thinking;
  if (Array.isArray(msg?.content)) {
    const thinkingBlock = msg.content.find((b: any) => b.type === "thinking");
    return thinkingBlock?.thinking ?? "";
  }
  return "";
}

function isToolCall(msg: any): boolean {
  return msg?.role === "assistant" && Array.isArray(msg?.content);
}

function getToolCallNames(msg: any): string[] {
  if (!isToolCall(msg)) return [];
  const tools: string[] = [];
  for (const block of msg.content) {
    if (block.type === "toolCall") tools.push(block.name ?? "unknown");
  }
  return tools;
}

function isToolResultError(msg: any): boolean {
  if (msg?.role !== "toolResult") return false;
  if (msg?.isError === true) return true;
  if (msg?.details?.error) {
    // Exclude false positives: "Exit code: 0" means success
    const content = getMessageContent(msg).trim();
    if (content === "Exit code: 0") return false;
    return true;
  }
  return false;
}

function isScreenshotCall(toolNames: string[]): boolean {
  return toolNames.some((n) => n.toLowerCase().includes("screenshot"));
}

function getScreenshotDescription(msg: any): string {
  if (msg?.role !== "toolResult") return "";
  const c = msg?.content;
  if (!Array.isArray(c)) return "";
  for (const block of c) {
    if (block.type === "text" && block.text) {
      const text = block.text;
      if (text.includes("描述") || text.includes("screenshot") || text.includes("截图")) {
        return text;
      }
    }
  }
  return "";
}

function getUserComplaintPatterns(): RegExp[] {
  return [
    /不对/i,
    /错了/i,
    /错误/i,
    /不要/i,
    /不是/i,
    /完全/i,
    /怎么搞的/i,
    /这是什么/i,
    /我说的是/i,
    /你没理解/i,
  ];
}

function isUserComplaint(text: string): boolean {
  return getUserComplaintPatterns().some((p) => p.test(text));
}

function stripPunctuation(s: string): string {
  return s.replace(/[，,。.！!？?：:；;、\s]+/g, " ").trim();
}

// ── Chinese keyword extraction ──

const CHINESE_VISUAL_KEYWORDS = new Set([
  "颜色", "材质", "纹理", "灯光", "阴影", "反射", "透明", "半透明",
  "模糊", "雾", "云", "水面", "地面", "天空", "粒子", "辉光",
  "轮廓", "形状", "大小", "比例", "位置", "角度", "亮度", "对比度",
  "饱和度", "色调", "粗糙", "光滑", "金属", "玻璃", "布料", "木头",
  "石头", "火焰", "烟雾", "水流", "草地", "树叶", "镜面", "漫反射",
  "高光", "法线", "位移", "混合", "叠加", "偏色", "鬼影", "噪点",
  "细节", "清晰", "柔和", "锐利", "暗", "亮", "冷色调",
  "暖色调", "背景", "前景", "中心", "边缘", "整体",
]);

export function extractScreenshotKeywords(description: string): string[] {
  const stripped = stripPunctuation(description);
  const found: string[] = [];
  for (const kw of CHINESE_VISUAL_KEYWORDS) {
    if (stripped.includes(kw)) found.push(kw);
  }
  return found;
}

export function extractTargetKeywords(firstUserMessage: string, title: string): string[] {
  const combined = `${title} ${firstUserMessage}`;
  const stripped = stripPunctuation(combined);
  const found: string[] = [];
  const segments = stripped.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  for (const seg of segments) {
    if (CHINESE_VISUAL_KEYWORDS.has(seg) && !found.includes(seg)) {
      found.push(seg);
    }
    if (seg.length >= 3) {
      for (let i = 0; i <= seg.length - 2; i++) {
        const sub = seg.slice(i, i + 2);
        if (CHINESE_VISUAL_KEYWORDS.has(sub) && !found.includes(sub)) {
          found.push(sub);
        }
      }
    }
  }
  return found.slice(0, 20);
}

// ── Jaccard distance ──

export function jaccardDistance(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return 1 - intersection.size / union.size;
}

// ── Deviation detection ──

const JACCARD_THRESHOLD = 0.7;

export function detectDeviations(
  messages: any[],
  targetKeywords: string[],
): DeviationPoint[] {
  const deviations: DeviationPoint[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const desc = getScreenshotDescription(msg);
    if (!desc) continue;
    const screenshotKeywords = extractScreenshotKeywords(desc);
    if (screenshotKeywords.length === 0) continue;
    const dist = jaccardDistance(targetKeywords, screenshotKeywords);
    if (dist > JACCARD_THRESHOLD) {
      let severity: "low" | "medium" | "high" = "medium";
      if (dist > 0.9) severity = "high";
      else if (dist < 0.8) severity = "low";
      deviations.push({
        messageIdx: i,
        screenshotKeyword: screenshotKeywords.join(", "),
        targetKeyword: targetKeywords.join(", "),
        severity,
        description: `Screenshot at M${i} shows visual elements diverging from target (Jaccard distance: ${(dist * 100).toFixed(1)}%)`,
      });
    }
  }
  return deviations;
}

// ── Phase detection (regex-based) ──

interface PhaseSignal {
  idx: number;
  type: "intent_change" | "tool_mutation" | "complaint" | "screenshot" | "error";
  label: string;
}

export function detectPhases(messages: any[]): PhaseInfo[] {
  const signals: PhaseSignal[] = [];
  const intentPhrases = [
    /let me (?:create|build|add|implement|start|begin|set up|design)/i,
    /let me (?:fix|debug|investigate|check|review|test|verify)/i,
    /let me (?:refactor|clean|optimize|improve|enhance|update|modify)/i,
    /let me (?:remove|delete|revert|undo|rollback)/i,
    /let me (?:finish|complete|wrap|finalize)/i,
    /我来(?:创建|构建|添加|实现|开始|设置|设计)/i,
    /我来(?:修复|调试|调查|检查|审查|测试|验证)/i,
    /我来(?:重构|清理|优化|改进|增强|更新|修改)/i,
    /我来(?:删除|移除|回退|撤销)/i,
  ];

  let lastToolCount = 0;
  let lastToolNames = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const role = getMessageRole(msg);

    if (role === "assistant") {
      // Check thinking text for intent signals
      const thinking = getThinking(msg);
      if (thinking) {
        for (const pattern of intentPhrases) {
          if (pattern.test(thinking)) {
            signals.push({ idx: i, type: "intent_change", label: thinking.slice(0, 60) });
            break;
          }
        }
      }

      // Tool call pattern mutation
      const toolNames = getToolCallNames(msg);
      if (toolNames.length > 0) {
        const newTools = toolNames.filter((n) => !lastToolNames.has(n));
        const removedTools = [...lastToolNames].filter((n) => !toolNames.includes(n));
        if (Math.abs(toolNames.length - lastToolCount) >= 3 || newTools.length >= 2 || removedTools.length >= 2) {
          signals.push({ idx: i, type: "tool_mutation", label: `Tools: ${toolNames.join(", ")}` });
        }
        lastToolCount = toolNames.length;
        lastToolNames = new Set(toolNames);
      }
    }

    if (role === "user") {
      const content = getMessageContent(msg);
      if (content && isUserComplaint(content)) {
        signals.push({ idx: i, type: "complaint", label: content.slice(0, 60) });
      }
    }

    // Screenshot events
    const toolNames = getToolCallNames(msg);
    if (isScreenshotCall(toolNames)) {
      signals.push({ idx: i, type: "screenshot", label: "Screenshot taken" });
    }

    if (isToolResultError(msg)) {
      const toolName = msg?.toolName ?? "unknown";
      const errSummary = getMessageContent(msg).slice(0, 60);
      signals.push({ idx: i, type: "error", label: `${toolName}: ${errSummary}` });
    }
  }

  // Convert signals to phases
  if (signals.length === 0) {
    return [{
      label: "Full Session",
      startIdx: 0,
      endIdx: Math.max(0, messages.length - 1),
      status: "ok",
      summary: "Single continuous session",
      toolCalls: { total: 0, errors: 0 },
    }];
  }

  const phases: PhaseInfo[] = [];
  let phaseStart = 0;
  let currentLabel = "Initial Phase";
  let currentStatus: "ok" | "warn" | "danger" = "ok";

  for (const sig of signals) {
    if (sig.idx > phaseStart) {
      phases.push({
        label: currentLabel,
        startIdx: phaseStart,
        endIdx: sig.idx - 1,
        status: currentStatus,
        summary: `Messages ${phaseStart}-${sig.idx - 1}`,
        toolCalls: { total: 0, errors: 0 },
      });
    }
    phaseStart = sig.idx;
    currentLabel = sig.label;
    if (sig.type === "complaint" || sig.type === "error") {
      currentStatus = "danger";
    } else if (sig.type === "tool_mutation") {
      currentStatus = "warn";
    } else {
      currentStatus = "ok";
    }
  }

  // Final phase
  if (phaseStart < messages.length) {
    phases.push({
      label: currentLabel,
      startIdx: phaseStart,
      endIdx: messages.length - 1,
      status: currentStatus,
      summary: `Messages ${phaseStart}-${messages.length - 1}`,
      toolCalls: { total: 0, errors: 0 },
    });
  }

  // Fill tool call counts per phase
  for (const phase of phases) {
    let total = 0;
    let errors = 0;
    for (let i = phase.startIdx; i <= phase.endIdx && i < messages.length; i++) {
      const msg = messages[i];
      const toolNames = getToolCallNames(msg);
      total += toolNames.length;
      if (isToolResultError(msg)) errors++;
    }
    phase.toolCalls = { total, errors };
  }

  return phases;
}

// ── Root cause inference ──

export function inferRootCauses(
  messages: any[],
  deviations: DeviationPoint[],
  phases: PhaseInfo[],
): RootCause[] {
  const causes: RootCause[] = [];

  // Effect overload: multiple tool calls with overlapping visual mechanisms
  const visualToolPatterns = ["FakeReflections", "Overlay", "SSR", "Blur", "Glow", "PostProcess", "Volume"];
  let effectOverloadCount = 0;
  const evidenceForOverload: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const names = getToolCallNames(messages[i]);
    const visual = names.filter((n) => visualToolPatterns.some((p) => n.includes(p)));
    if (visual.length >= 2) {
      effectOverloadCount++;
      evidenceForOverload.push(i);
    }
  }
  if (effectOverloadCount >= 3) {
    causes.push({
      title: "效果过载",
      description: `在 ${effectOverloadCount} 次工具调用中同时启用了多个重叠的视觉效果机制，导致画面混乱。`,
      evidenceIndices: evidenceForOverload,
      severity: "primary",
    });
  }

  // Perception blind spot: screenshot shows anomalies but thinking doesn't acknowledge
  const anomalyKeywords = ["云", "雾", "鬼影", "透明", "噪点", "错位", "扭曲", "异常"];
  const blindSpotEvidence: number[] = [];
  for (const dev of deviations) {
    const msgIdx = dev.messageIdx;
    for (let j = Math.max(0, msgIdx - 2); j <= Math.min(messages.length - 1, msgIdx + 2); j++) {
      const msg = messages[j];
      if (getMessageRole(msg) !== "assistant") continue;
      const thinking = getThinking(msg);
      if (thinking) {
        const recognizesProblem = anomalyKeywords.some((kw) => thinking.includes(kw));
        if (!recognizesProblem) {
          blindSpotEvidence.push(msgIdx);
          break;
        }
      }
    }
  }
  if (blindSpotEvidence.length > 0) {
    causes.push({
      title: "截图感知盲区",
      description: `在 ${blindSpotEvidence.length} 次截图中出现画面异常，但 assistant thinking 未识别到问题。`,
      evidenceIndices: blindSpotEvidence,
      severity: "primary",
    });
  }

  // Scope creep
  const complaintPhases = phases.filter((p) => p.status === "danger");
  if (complaintPhases.length > 0 && phases.length >= 3) {
    causes.push({
      title: "需求蔓延 (Scope Creep)",
      description: `Session 经历 ${phases.length} 个阶段，后期出现用户投诉，可能存在功能范围漂移。`,
      evidenceIndices: complaintPhases.map((p) => p.startIdx),
      severity: "secondary",

    });
  }

  // Tool-specific error analysis
  const toolErrors: Array<{ toolName: string; msgIdx: number; summary: string; errType: string }> = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (isToolResultError(msg)) {
      const toolName = msg?.toolName ?? "unknown";
      const summary = getMessageContent(msg).slice(0, 120);
      let errType = "unknown";
      // Classify error type from error message content
      if (summary.includes("hash") || summary.includes("low-entropy") || summary.includes("ambiguous") || summary.includes("anchor")) {
        errType = "hash_ambiguity";
      } else if (summary.includes("timeout") || summary.includes("timed out") || summary.includes("ETIMEDOUT")) {
        errType = "network_timeout";
      } else if (summary.includes("permission") || summary.includes("denied") || summary.includes("EACCES")) {
        errType = "permission_denied";
      } else if (summary.includes("not found") || summary.includes("ENOENT") || summary.includes("no such file")) {
        errType = "file_not_found";
      } else if (summary.includes("syntax") || summary.includes("SyntaxError") || summary.includes("Unexpected token")) {
        errType = "syntax_error";
      } else if (summary.includes("Exit code") || summary.includes("runtime") || summary.includes("Error:")) {
        errType = "runtime_error";
      } else if (summary.includes("overlapping") || summary.includes("combine them")) {
        errType = "tool_misuse";
      }
      toolErrors.push({ toolName, msgIdx: i, summary, errType });
    }
  }

  // Report dominant tool error pattern
  if (toolErrors.length > 0) {
    const byTool = new Map<string, Array<{ msgIdx: number; errType: string }>>();
    for (const te of toolErrors) {
      const key = `${te.toolName}:${te.errType}`;
      if (!byTool.has(key)) byTool.set(key, []);
      byTool.get(key)!.push({ msgIdx: te.msgIdx, errType: te.errType });
    }

    // Find dominant error pattern
    let dominantPattern = "";
    let dominantCount = 0;
    for (const [key, instances] of byTool) {
      if (instances.length > dominantCount) {
        dominantCount = instances.length;
        dominantPattern = key;
      }
    }

    if (dominantCount >= 2 && dominantPattern) {
      const [domTool, domErrType] = dominantPattern.split(":");
      const errLabels: Record<string, string> = {
        hash_ambiguity: "哈希锚点歧义",
        network_timeout: "网络超时",
        permission_denied: "权限拒绝",
        file_not_found: "文件不存在",
        syntax_error: "语法错误",
        runtime_error: "运行时错误",
        tool_misuse: "批量操作冲突",
        unknown: "未知错误",
      };
      const label = errLabels[domErrType] ?? domErrType;
      const totalByTool = toolErrors.filter((te) => te.toolName === domTool);
      const evidence = totalByTool.map((te) => te.msgIdx);

      // Determine if tool_error or tool_misuse
      const errLayer = domErrType === "tool_misuse" ? "agent_error" : "tool_error";

      causes.push({
        title: `${domTool} 工具${label} (${errLayer === "tool_error" ? "工具层" : "调用层"})`,
        description: `${domTool} 工具失败 ${dominantCount} 次（${label}），共 ${totalByTool.length} 次错误。${errLayer === "tool_error" ? "这是工具本身的问题，建议调整 Agent 的工具使用策略或等待工具修复。" : "这是 Agent 的工具调用方式问题，建议在 AGENTS.md 中添加相关指导规则。"} 错误样本: ${toolErrors.filter((te) => te.toolName === domTool).slice(0, 3).map((te) => te.summary.slice(0, 80)).join(" | ")}`,
        evidenceIndices: evidence,
        severity: dominantCount >= 5 ? "primary" : totalByTool.length >= 3 ? "primary" : "secondary",
      });
    }

    // Also add per-tool breakdown if multiple different tools failed
    const uniqueTools = new Set(toolErrors.map((te) => te.toolName));
    if (uniqueTools.size >= 2) {
      const breakdown = [...uniqueTools].map((t) => {
        const count = toolErrors.filter((te) => te.toolName === t).length;
        const types = [...new Set(toolErrors.filter((te) => te.toolName === t).map((te) => te.errType))];
        return `${t}(${count}次: ${types.join(",")})`;
      }).join("; ");
      causes.push({
        title: `多工具错误分布`,
        description: `多个工具出现错误: ${breakdown}`,
        evidenceIndices: toolErrors.map((te) => te.msgIdx),
        severity: "secondary",
      });
    }
  }

  // Fix cascade
  const errorPhases = phases.filter((p) => p.status === "warn" || p.status === "danger");
  if (errorPhases.length >= 3) {
    causes.push({
      title: "修复连锁反应 (Fix Cascade)",
      description: `${errorPhases.length} 个阶段存在错误或警告，可能形成修复->新问题->再修复的连锁。`,
      evidenceIndices: errorPhases.map((p) => p.startIdx),
      severity: errorPhases.length >= 5 ? "primary" : "secondary",
    });
  }

  return causes;
}


// ── Compact session (preprocessing for LLM) ──

export function compactSession(data: SerializedSession): CompactMessage[] {
  const messages = data.messages as any[];
  const compacted: CompactMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const role = getMessageRole(msg);
    const displayRole = role === "toolResult" ? "user" : role as "user" | "assistant";
    const cm: CompactMessage = { idx: i, role: displayRole };

    if (role === "user") {
      // Keep full user message — they are the ground truth
      cm.keyQuote = getMessageContent(msg);
      if (isUserComplaint(cm.keyQuote)) {
        cm.userEmotion = "frustrated";
      }
    } else if (role === "toolResult") {
      cm.role = "user";
      const resultText = getMessageContent(msg);
      if (isToolResultError(msg)) {
        cm.error = resultText.slice(0, 500);
      } else if (resultText.length > 0) {
        // Keep tool result for key tools
        const toolName = msg?.toolName ?? "";
        if (resultText.length <= 500) {
          cm.toolResult = resultText;
        } else {
          cm.toolResult = `[${toolName} output: ${resultText.length} chars] ` + resultText.slice(0, 400) + "...";
        }
      }
      const desc = getScreenshotDescription(msg);
      if (desc) {
        cm.screenshotDesc = desc.slice(0, 500);
      }
    } else if (role === "assistant") {
      const thinking = getThinking(msg);
      const toolNames = getToolCallNames(msg);

      // Smart thinking truncation: more chars for key moments
      const isKey = toolNames.length > 0 || i < 5 || i > messages.length - 5;
      if (thinking) {
        cm.thinking = isKey
          ? thinking.slice(0, 600)
          : thinking.slice(0, 200);
      }

      if (toolNames.length > 0) {
        cm.toolsCalled = toolNames;
        // Extract key args for important tools
        const argsParts: string[] = [];
        for (const block of msg.content) {
          if (block.type === "toolCall" && block.arguments) {
            const args = block.arguments as Record<string, unknown>;
            if (args.path) argsParts.push(`path=${String(args.path).split("/").pop()}`);
            if (args.command) argsParts.push(`cmd=${String(args.command).slice(0, 80)}`);
            if (args.content && typeof args.content === "string") {
              argsParts.push(`content(${args.content.length}c):${args.content.slice(0, 50)}`);
            }
          }
        }
        if (argsParts.length > 0) cm.toolArgs = argsParts.join("; ");
      }
    }

    compacted.push(cm);
  }

  return compacted;
}

// ── Main analysis function ──

export function analyzeSession(
  data: SerializedSession,
  _compactMessages?: CompactMessage[],
): EvalResult {
  const messages = data.messages as any[];
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
  let userComplaints = 0;
  for (const msg of messages) {
    const names = getToolCallNames(msg);
    toolCalls += names.length;
    if (isScreenshotCall(names)) screenshotsTaken++;
    if (isToolResultError(msg)) toolErrors++;
    if (getMessageRole(msg) === "user" && isUserComplaint(getMessageContent(msg))) {
      userComplaints++;
    }
  }
  const errorRate = toolCalls > 0 ? ((toolErrors / toolCalls) * 100).toFixed(1) + "%" : "0.0%";

  const stats: ToolStats = {
    toolCalls,
    toolErrors,
    errorRate,
    screenshotsTaken,
    userComplaints,
  };

  // Target keywords
  const firstUserMsg = messages.find((m: any) => m.role === "user");
  const targetKeywords = extractTargetKeywords(
    firstUserMsg ? getMessageContent(firstUserMsg) : "",
    meta.title,
  );

  // Phase detection
  const phases = detectPhases(messages);

  // Deviation detection
  const deviations = detectDeviations(messages, targetKeywords);

  // Root causes
  const rootCauses = inferRootCauses(messages, deviations, phases);

  // Build timeline
  const timeline: TimelineEvent[] = [];
  for (const phase of phases) {
    timeline.push({
      messageIdx: phase.startIdx,
      type: "phase_start" as const,
      label: phase.label,
      severity: phase.status,
    });
  }
  for (const dev of deviations) {
    timeline.push({
      messageIdx: dev.messageIdx,
      type: "deviation" as const,
      label: dev.description,
      severity: dev.severity === "high" ? "danger" : dev.severity === "medium" ? "warn" : "ok",
    });
  }
  for (let i = 0; i < messages.length; i++) {
    if (getMessageRole(messages[i]) === "user" && isUserComplaint(getMessageContent(messages[i]))) {
      timeline.push({
        messageIdx: i,
        type: "complaint" as const,
        label: getMessageContent(messages[i]).slice(0, 80),
        severity: "danger",
      });
    }
    if (isToolResultError(messages[i])) {
      timeline.push({
        messageIdx: i,
        type: "error" as const,
        label: `${messages[i]?.toolName ?? "unknown"}: ${getMessageContent(messages[i]).slice(0, 60)}`,
        severity: "warn",
      });
    }
  }
  timeline.sort((a, b) => a.messageIdx - b.messageIdx);

  const partial: EvalResult = {
    metadata,
    stats,
    phases,
    deviations,
    rootCauses,
    rules: [],
    timeline,
    analysisMode: "rule",
    causalGraph: null,
    attribution: null,
    rulesApplied: [],
  };
  return partial;
}
