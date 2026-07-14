// ── CHIFF Agent Loop Engine ──
// Lightweight agent loop: while (!done) { callLLM; executeTools }.
// Each CHIFF Pass spawns an independent Agent session with fresh message history.
// Agent self-terminates by producing valid JSON output matching the output schema.

import { completeSimple } from "../../models/index.js";
import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
  readdirSync, statSync,
} from "node:fs";
import { resolve, relative, sep, join } from "node:path";
import type { HarnessAPI } from "../../core/harness-api.js";
import { resolveModel } from "../../models/index.js";
import {
  type TextContent,
  type ThinkingContent,
  type ToolCall as PiToolCall,
  type Message as PiMessage,
} from "@earendil-works/pi-ai";
import { safeJsonParse, type ValidationResult } from "../schemas.js";
import { extractJSON } from "../prompts.js";

// ── Types ──

export interface ProgressEvent {
  type: "tool_call" | "thinking" | "output";
  phase: string;
  detail: string;
  toolCallsSoFar: number;
}

export interface AgentLoopConfig<T> {
  /** Session ID for workspace path resolution */
  sessionId: string;
  /** Absolute path to the workspace root (~/.dscode/eval/{sessionId}/) */
  workspacePath: string;
  /** System prompt defining the Agent's role and constraints */
  systemPrompt: string;
  /** Task prompt with specific instructions for this Pass */
  taskPrompt: string;
  /** Harness API for LLM calls */
  harness: HarnessAPI;
  /** Max tool calls before forced output (default 30) */
  maxToolCalls?: number;
  /** Human-readable schema description for correction hints */
  outputSchemaDescription: string;
  /** Validator function matching the expected output type */
  validator: (obj: unknown) => ValidationResult<T>;
  /** Progress callback for real-time display */
  onProgress?: (event: ProgressEvent) => void;
  /** Phase identifier (e.g., "SCAN", "ZOOM-Z1", "SYNTHESIZE") */
  phase: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ── Message Types ──

interface TextMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ToolResultMessage {
  role: "tool_result";
  toolCallId: string;
  toolName: string;
  content: string;
  timestamp: number;
}

type AgentMessage = TextMessage | ToolResultMessage;

// ── Constants ──

const DEFAULT_MAX_TOOL_CALLS = 30;
const MAX_JSON_RETRIES = 3;
const FORCE_OUTPUT_EXTRA_ATTEMPTS = 5;

// ── Simple Glob (no dependency) ──

function simpleGlob(pattern: string, cwd: string): string[] {
  const results: string[] = [];
  const parts = pattern.replace(/\\/g, "/").split("/");

  function recurse(dir: string, segmentIdx: number): void {
    if (segmentIdx >= parts.length) {
      // Verify it's a file
      if (existsSync(dir)) {
        try {
          const st = statSync(dir);
          if (st.isFile()) {
            results.push(dir);
          }
        } catch { /* skip */ }
      }
      return;
    }

    const segment = parts[segmentIdx];
    if (!existsSync(dir)) return;

    if (segment === "**") {
      // **: recurse into all subdirs and also try matching remaining segments
      // Match **/remaining...
      if (segmentIdx + 1 < parts.length) {
        const remaining = parts.slice(segmentIdx + 1).join("/");
        recurseAll(dir, remaining);
      } else {
        // ** alone — match all files
        collectAllFiles(dir);
      }
      return;
    }

    if (segment.includes("*")) {
      // Glob segment with wildcard
      const regex = new RegExp(
        "^" + segment.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
      );
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (regex.test(entry.name)) {
            const full = join(dir, entry.name);
            if (segmentIdx === parts.length - 1) {
              if (entry.isFile()) results.push(full);
            } else if (entry.isDirectory()) {
              recurse(full, segmentIdx + 1);
            }
          }
        }
      } catch { /* skip */ }
    } else {
      // Literal segment
      const full = join(dir, segment);
      if (segmentIdx === parts.length - 1) {
        try {
          const st = statSync(full);
          if (st.isFile()) results.push(full);
        } catch { /* skip */ }
      } else {
        recurse(full, segmentIdx + 1);
      }
    }
  }

  function recurseAll(baseDir: string, remainingPattern: string): void {
    try {
      const entries = readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(baseDir, entry.name);
        if (entry.isDirectory()) {
          recurseAll(full, remainingPattern);
        }
      }
      // Also try matching from this dir
      const tmpPattern = remainingPattern.replace(/\\/g, "/").split("/");
      function tryMatch(dir: string, idx: number): void {
        if (idx >= tmpPattern.length) {
          try {
            const st = statSync(dir);
            if (st.isFile()) results.push(dir);
          } catch { /* skip */ }
          return;
        }
        const seg = tmpPattern[idx];
        if (seg.includes("*")) {
          const regex = new RegExp("^" + seg.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
          try {
            for (const e of readdirSync(dir, { withFileTypes: true })) {
              if (regex.test(e.name)) {
                const f = join(dir, e.name);
                if (idx === tmpPattern.length - 1) {
                  if (e.isFile()) results.push(f);
                } else if (e.isDirectory()) {
                  tryMatch(f, idx + 1);
                }
              }
            }
          } catch { /* skip */ }
        } else {
          tryMatch(join(dir, seg), idx + 1);
        }
      }
      tryMatch(baseDir, 0);
    } catch { /* skip */ }
  }

  function collectAllFiles(dir: string): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isFile()) results.push(full);
        else if (entry.isDirectory()) collectAllFiles(full);
      }
    } catch { /* skip */ }
  }

  // Normalize: strip leading ./ if present
  const cleanPattern = pattern.replace(/^\.\//, "");
  recurse(cwd, 0);
  return results;
}

// ── Path Sandbox ──

function sanitizePath(raw: string, workspacePath: string): string {
  // Reject absolute paths
  if (raw.startsWith("/") || raw.startsWith(sep)) {
    throw new Error("路径超出工作目录范围");
  }
  // Reject path traversal
  const normalized = raw.replace(/\\/g, "/");
  if (normalized.includes("../") || normalized.includes("..\\")) {
    throw new Error("路径超出工作目录范围");
  }
  return resolve(workspacePath, raw);
}

function isWithinScope(resolved: string, workspacePath: string): boolean {
  const rel = relative(workspacePath, resolved);
  if (rel.startsWith("..")) return false;
  return true;
}

function validateReadScope(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith("library/") ||
    normalized.startsWith("notebook/") ||
    normalized.startsWith("output/");
}

function validateWriteScope(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith("notebook/") ||
    normalized.startsWith("output/");
}

function validateSearchScope(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith("library/") ||
    normalized.startsWith("notebook/");
}

// ── Tool Executors ──

function executeReadFile(args: Record<string, unknown>, workspacePath: string): string {
  const raw = String(args["path"] ?? args["file"] ?? "");
  if (!raw) return "Error: missing path argument";
  try {
    const abs = sanitizePath(raw, workspacePath);
    if (!isWithinScope(abs, workspacePath)) return "Error: 路径超出工作目录范围";
    const rel = relative(workspacePath, abs).replace(/\\/g, "/");
    if (!validateReadScope(rel)) return "Error: read_file 仅允许访问 library/、notebook/、output/";
    if (!existsSync(abs)) return `Error: 文件不存在: ${rel}`;
    const content = readFileSync(abs, "utf-8");
    return content;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function executeWriteFile(args: Record<string, unknown>, workspacePath: string): string {
  const raw = String(args["path"] ?? args["file"] ?? "");
  const content = String(args["content"] ?? "");
  if (!raw) return "Error: missing path argument";
  try {
    const abs = sanitizePath(raw, workspacePath);
    if (!isWithinScope(abs, workspacePath)) return "Error: 路径超出工作目录范围";
    const rel = relative(workspacePath, abs).replace(/\\/g, "/");
    if (!validateWriteScope(rel)) return "Error: write_file 仅允许写入 notebook/ 和 output/";
    const dir = resolve(abs, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(abs, content, "utf-8");
    return `文件已写入: ${rel} (${content.length} 字符)`;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function executeGrep(args: Record<string, unknown>, workspacePath: string): string {
  const pattern = String(args["pattern"] ?? "");
  const searchPath = String(args["path"] ?? args["directory"] ?? "library/");
  if (!pattern) return "Error: missing pattern argument";
  try {
    const abs = sanitizePath(searchPath, workspacePath);
    if (!isWithinScope(abs, workspacePath)) return "Error: 路径超出工作目录范围";
    const rel = relative(workspacePath, abs).replace(/\\/g, "/");
    if (!validateSearchScope(rel) && rel !== ".") {
      if (!validateSearchScope(searchPath.replace(/\\/g, "/"))) {
        return "Error: grep 仅允许搜索 library/ 和 notebook/";
      }
    }
    // Use simpleGlob to find files, then grep them
    const searchGlob = rel === "." ? "library/**/*.md" : `${rel}/**/*.md`;
    const files = simpleGlob(searchGlob, workspacePath);
    const lines: string[] = [];
    for (const file of files) {
      if (!existsSync(file)) continue;
      const fileRel = relative(workspacePath, file).replace(/\\/g, "/");
      if (!validateSearchScope(fileRel)) continue;
      try {
        const text = readFileSync(file, "utf-8");
        const textLines = text.split("\n");
        for (let i = 0; i < textLines.length; i++) {
          if (textLines[i].includes(pattern)) {
            const snippet = textLines[i].slice(0, 200);
            lines.push(`${fileRel}:${i + 1}: ${snippet}`);
          }
        }
        if (lines.length > 200) {
          lines.push(`... (${lines.length - 200} 条结果被截断)`);
          return lines.slice(0, 201).join("\n");
        }
      } catch {
        // Skip unreadable files
      }
    }
    return lines.length > 0 ? lines.join("\n") : `未找到匹配 "${pattern}" 的结果`;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function executeGlob(args: Record<string, unknown>, workspacePath: string): string {
  const pattern = String(args["pattern"] ?? "");
  if (!pattern) return "Error: missing pattern argument";
  try {
    if (pattern.includes("../") || pattern.startsWith("/")) {
      return "Error: 路径超出工作目录范围";
    }
    const files = simpleGlob(pattern, workspacePath);
    const filtered = files.filter((f: string) => {
      const rel = relative(workspacePath, f).replace(/\\/g, "/");
      return validateSearchScope(rel);
    });
    const results = filtered.map((f: string) => relative(workspacePath, f).replace(/\\/g, "/"));
    if (results.length > 200) {
      return results.slice(0, 200).join("\n") + `\n... (${results.length - 200} 条结果被截断)`;
    }
    return results.length > 0 ? results.join("\n") : "未找到匹配文件";
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Tool Execution Router ──

function executeToolCall(
  tool: ToolCall,
  workspacePath: string,
): string {
  switch (tool.name) {
    case "read_file":
      return executeReadFile(tool.arguments, workspacePath);
    case "write_file":
      return executeWriteFile(tool.arguments, workspacePath);
    case "grep":
      return executeGrep(tool.arguments, workspacePath);
    case "glob":
      return executeGlob(tool.arguments, workspacePath);
    default:
      return `Error: 未知工具 "${tool.name}"。可用工具: read_file, write_file, grep, glob`;
  }
}

// ── Tool Call Extraction from LLM Response ──

function extractToolCalls(content: (TextContent | ThinkingContent | PiToolCall)[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const block of content) {
    if (block.type === "toolCall") {
      const tc = block as PiToolCall;
      calls.push({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments ?? {},
      });
    }
  }
  return calls;
}

function extractTextContent(content: (TextContent | ThinkingContent | PiToolCall)[]): string {
  const texts: string[] = [];
  for (const block of content) {
    if (block.type === "text") {
      const tb = block as TextContent;
      if (tb.text) texts.push(tb.text);
    } else if (block.type === "thinking") {
      const th = block as ThinkingContent;
      if (th.thinking) texts.push(th.thinking);
    }
  }
  return texts.join("\n");
}

// ── LLM Call ──

async function callAgentLLM(
  systemPrompt: string,
  messages: AgentMessage[],
  harness: HarnessAPI,
): Promise<{ content: (TextContent | ThinkingContent | PiToolCall)[] }> {
  const model = resolveModel(harness.config.provider, harness.config.modelId);
  const response = await completeSimple(
    model,
    {
      systemPrompt,
      messages: messages.map((m): PiMessage => {
        if (m.role === "user") {
          return { role: "user", content: m.content, timestamp: m.timestamp };
        }
        if (m.role === "assistant") {
          return { role: "assistant", content: [{ type: "text", text: m.content }], timestamp: m.timestamp } as PiMessage;
        }
        // tool_result → render as user message
        return {
          role: "user",
          content: `[Tool Result: ${(m as ToolResultMessage).toolName}]\n${m.content}`,
          timestamp: m.timestamp,
        } as PiMessage;
      }),
    },
    { apiKey: harness.config.apiKey },
  );
  return { content: response.content };
}

// ── Main Agent Loop ──

export async function agentLoop<T>(
  config: AgentLoopConfig<T>,
): Promise<T | null> {
  const {
    systemPrompt,
    taskPrompt,
    harness,
    workspacePath,
    outputSchemaDescription,
    validator,
    onProgress,
    phase,
  } = config;

  const maxToolCalls = config.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;

  const messages: AgentMessage[] = [
    { role: "user", content: taskPrompt, timestamp: Date.now() },
  ];

  let toolCallsSoFar = 0;
  let consecutiveJsonFailures = 0;
  let forceOutputMode = false;
  let forceOutputAttempts = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // ── Soft Limit Enforcement ──
    if (!forceOutputMode && toolCallsSoFar >= maxToolCalls) {
      forceOutputMode = true;
      forceOutputAttempts = 0;
      messages.push({
        role: "user",
        content: "已达到最大 tool call 次数，请立即输出 JSON，不要再调用工具",
        timestamp: Date.now(),
      });
    } else if (!forceOutputMode && toolCallsSoFar >= maxToolCalls - 5) {
      messages.push({
        role: "user",
        content: "剩余 tool call 次数有限，请尽快输出 JSON",
        timestamp: Date.now(),
      });
    }

    if (forceOutputMode && forceOutputAttempts >= FORCE_OUTPUT_EXTRA_ATTEMPTS) {
      return null;
    }

    // ── Thinking Progress ──
    onProgress?.({
      type: "thinking",
      phase,
      detail: "Agent 思考中...",
      toolCallsSoFar,
    });

    // ── Call LLM ──
    let response: { content: (TextContent | ThinkingContent | PiToolCall)[] };
    try {
      response = await callAgentLLM(systemPrompt, messages, harness);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      messages.push({
        role: "user",
        content: `LLM 调用失败: ${errMsg}。请重试。`,
        timestamp: Date.now(),
      });
      continue;
    }

    // ── Check for tool calls ──
    const toolCalls = extractToolCalls(response.content);

    if (toolCalls.length > 0) {
      if (forceOutputMode) {
        forceOutputAttempts++;
        messages.push({
          role: "user",
          content: "请立即输出 JSON，不要再调用工具！这是最后警告。",
          timestamp: Date.now(),
        });
        continue;
      }

      // Execute each tool and append results
      for (const tc of toolCalls) {
        toolCallsSoFar++;

        const toolDetail = `${tc.name}(${JSON.stringify(tc.arguments).slice(0, 80)})`;
        onProgress?.({
          type: "tool_call",
          phase,
          detail: toolDetail,
          toolCallsSoFar,
        });

        messages.push({
          role: "assistant",
          content: `[Tool Call: ${tc.name}] ${JSON.stringify(tc.arguments)}`,
          timestamp: Date.now(),
        });

        const toolResult = executeToolCall(tc, workspacePath);

        messages.push({
          role: "tool_result",
          toolCallId: tc.id,
          toolName: tc.name,
          content: toolResult,
          timestamp: Date.now(),
        });
      }
      continue;
    }

    // ── No tool calls: try to extract JSON ──
    const text = extractTextContent(response.content);

    messages.push({
      role: "assistant",
      content: text.slice(0, 1000),
      timestamp: Date.now(),
    });

    const json = extractJSON(text);

    if (!json) {
      consecutiveJsonFailures++;
      if (consecutiveJsonFailures >= MAX_JSON_RETRIES) {
        return null;
      }
      messages.push({
        role: "user",
        content: `输出不是合法的 JSON，请检查格式后重新输出。Schema: ${outputSchemaDescription}`,
        timestamp: Date.now(),
      });
      if (forceOutputMode) forceOutputAttempts++;
      continue;
    }

    // Validate JSON
    const result = safeJsonParse(json, phase, validator);
    if (result === null) {
      consecutiveJsonFailures++;
      if (consecutiveJsonFailures >= MAX_JSON_RETRIES) {
        return null;
      }
      const schemaHint = `输出 JSON 结构不正确，请对照 schema 修正。Schema: ${outputSchemaDescription}`;
      messages.push({
        role: "user",
        content: schemaHint,
        timestamp: Date.now(),
      });
      if (forceOutputMode) forceOutputAttempts++;
      continue;
    }

    // ── Success ──
    onProgress?.({
      type: "output",
      phase,
      detail: `输出完成 — JSON 校验通过`,
      toolCallsSoFar,
    });

    return result;
  }
}
