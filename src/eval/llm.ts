// ── LLM-Based Session Analysis ──
// Uses completeSimple() for a direct one-shot API call.
// No agent state manipulation, no session side effects.

import type { EvalResult, CompactMessage } from "./types.js";
import { analyzeSession, compactSession } from "./analyzer.js";
import type { HarnessAPI } from "../core/harness-api.js";
import type { SerializedSession } from "../session/types.js";
import { resolveModel } from "../models/index.js";
import { completeSimple } from "@mariozechner/pi-ai";

// ── System Prompt ──

function buildAnalysisPrompt(compactMessages: CompactMessage[], metadata: EvalResult["metadata"]): string {
  const lines: string[] = [];

  lines.push("SESSION METADATA");
  lines.push("────────────────");
  lines.push(`ID: ${metadata.sessionId}`);
  lines.push(`Title: ${metadata.title}`);
  lines.push(`Model: ${metadata.model}`);
  lines.push(`Duration: ${metadata.duration} | ${metadata.totalMessages} messages`);
  lines.push("");
  lines.push("═══════════════════════════════════════");
  lines.push("COMPRESSED SESSION LOG");
  lines.push("═══════════════════════════════════════");
  lines.push("");

  for (const cm of compactMessages) {
    const prefix = `M${cm.idx} [${cm.role}]`;
    if (cm.role === "user") {
      lines.push(`${prefix}:`);
      if (cm.keyQuote) lines.push(`  "${cm.keyQuote.slice(0, 300)}"`);
      if (cm.screenshotDesc) lines.push(`  🖼 screenshot: "${cm.screenshotDesc.slice(0, 300)}"`);
      if (cm.toolResult) lines.push(`  📤 result: ${cm.toolResult.slice(0, 300)}`);
      if (cm.error) lines.push(`  ❌ error: ${cm.error.slice(0, 300)}`);
      if (cm.userEmotion === "frustrated") lines.push("  😤 用户不满");
    } else {
      // Skip assistant messages with no meaningful content
      const hasContent = cm.thinking || (cm.toolsCalled && cm.toolsCalled.length > 0);
      if (!hasContent) continue;
      lines.push(`${prefix}:`);
      if (cm.thinking) lines.push(`  💭 ${cm.thinking.slice(0, 400)}`);
      if (cm.toolsCalled && cm.toolsCalled.length > 0) {
        const toolInfo = cm.toolArgs ? ` → ${cm.toolArgs}` : "";
        lines.push(`  🔧 ${cm.toolsCalled.join(", ")}${toolInfo}`);
      }
      if (cm.error) lines.push(`  ❌ ${cm.error.slice(0, 200)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `你是一个 tracer 日志分析专家。以下是一条 AI 编程 agent（dscode）的工作日志，请分析并输出一个诊断 Dashboard。

分析维度：
1. Phase 划分 — 将 session 划分为若干阶段，标注每段的起止、状态(ok/warn/danger)、摘要
2. 偏离检测 — 找出 agent 的反馈结果与用户目标产生语义偏离的时刻（如：截图与需求不符、生成的文件内容跑偏、agent 理解错了用户意图等）
3. 根因推断 — 推断 agent 出错的深层原因（如效果过载、感知盲区、需求蔓延、修复连锁等）
4. 改进建议 — 3-5 条针对 dscode agent 设计的具体改进建议（中文）

输出纯 JSON，不要 markdown 代码块：
{
  "phases": [{"label":"...","startIdx":0,"endIdx":10,"status":"ok","summary":"...","toolCalls":{"total":5,"errors":0}}],
  "deviations": [{"messageIdx":72,"description":"...","severity":"high"}],
  "rootCauses": [{"title":"...","description":"...","evidenceIndices":[72],"severity":"primary"}],
  "suggestions": ["建议1","建议2"]
}`;

function mergeResults(ruleResult: EvalResult, llmResult: any): EvalResult {
  return {
    metadata: ruleResult.metadata,
    stats: ruleResult.stats,
    phases: Array.isArray(llmResult.phases) && llmResult.phases.length > 0
      ? llmResult.phases : ruleResult.phases,
    deviations: Array.isArray(llmResult.deviations)
      ? llmResult.deviations.map((d: any) => ({
          messageIdx: d.messageIdx ?? 0,
          screenshotKeyword: d.screenshotKeyword ?? "",
          targetKeyword: d.targetKeyword ?? "",
          severity: d.severity ?? "medium",
          description: d.description ?? "",
        }))
      : ruleResult.deviations,
    rootCauses: Array.isArray(llmResult.rootCauses)
      ? llmResult.rootCauses : ruleResult.rootCauses,
    suggestions: Array.isArray(llmResult.suggestions) && llmResult.suggestions.length > 0
      ? llmResult.suggestions : ruleResult.suggestions,
    timeline: ruleResult.timeline,
    analysisMode: "llm",
  };
}

export async function analyzeWithLLM(
  data: SerializedSession,
  harness: HarnessAPI,
): Promise<EvalResult> {
  // Always run rule engine first for reliable metadata/stats
  const compacted = compactSession(data);
  const ruleResult = analyzeSession(data, compacted);

  try {
    const userMessage = buildAnalysisPrompt(compacted, ruleResult.metadata);

    // Build model from harness config — no agent involved
    const model = resolveModel(harness.config.provider, harness.config.modelId);

    // Direct one-shot API call — no agent, no session, no state pollution
    const response = await completeSimple(
      model,
      {
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user" as const, content: userMessage, timestamp: Date.now() }],
      },
      { apiKey: harness.config.apiKey },
    );

    // Extract text from response
    const content = typeof response.content === "string"
      ? response.content
      : Array.isArray(response.content)
        ? (response.content as any[]).find((b: any) => b.type === "text")?.text ?? ""
        : "";

    // Parse JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const llmResult = JSON.parse(jsonMatch[0]);
        if (llmResult && typeof llmResult === "object") {
          return mergeResults(ruleResult, llmResult);
        }
      } catch {
        // JSON parse failed — fall through to rule engine
      }
    }
  } catch {
    // API call failed — fall through to rule engine
  }

  return ruleResult;
}
