import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import type {
  AgentActivity,
  PermissionPrompt,
  PlanRecord,
  PlanViewInteraction,
  UIMessage,
} from "../types";
import {
  CheckCircle,
  Circle,
  MinusCircle,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import type { IntentAlignmentAnswer } from "../utils/intentAlignment";
import { ToolCard } from "./ToolCard";
import { Markdown } from "./Markdown";
import { AgentActivityCard } from "./AgentActivityCard";
import { IntentAlignment } from "./IntentAlignment";
import { ToolApprovalCard } from "./ToolApprovalCard";
import { InlinePermission, type ToolApprovalDecisionHandler } from "./InlinePermission";

interface ChatViewProps {
  messages: UIMessage[];
  processing: boolean;
  processingText?: string;
  hasStreaming: boolean;
  sessionActiveMs: number;
  permissionPrompt: PermissionPrompt | null;
  onPermission: ToolApprovalDecisionHandler;
  plan?: Readonly<PlanRecord> | null;
  planInteraction?: PlanViewInteraction | null;
  alignmentConnected?: boolean;
  alignmentConflicted?: boolean;
  onIntentAlignment?(answer: IntentAlignmentAnswer): boolean;
  containerRef?: React.RefObject<HTMLDivElement>;
  scrollLocked?: boolean;
}

export function findPermissionOwnerAgent(
  messages: UIMessage[],
  permissionPrompt: PermissionPrompt | null,
): AgentActivity | null {
  if (!permissionPrompt) return null;
  const match = messages.find((message) => {
    const activity = message.agentActivity;
    if (message.role !== "agent" || !activity) return false;
    if (permissionPrompt.agentId === activity.agentId) return true;
    return Boolean(
      permissionPrompt.toolCallId
      && activity.permission?.toolCallId === permissionPrompt.toolCallId,
    );
  });
  return match?.agentActivity ?? null;
}

export function ChatView({
  messages,
  processing,
  processingText = "Waiting...",
  hasStreaming,
  sessionActiveMs,
  permissionPrompt,
  onPermission,
  plan = null,
  planInteraction = null,
  alignmentConnected = true,
  alignmentConflicted = false,
  onIntentAlignment = () => false,
  containerRef,
  scrollLocked = false,
}: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const visiblePlanIdRef = useRef<string | undefined>(undefined);
  // sessionTime is driven by backend's getTotalActiveMs() via sessionActiveMs prop.
  // The backend already returns live time when the timer is running, so we must
  // NOT add local wall time on top (that would double-count).
  // session_time events from agent_start/agent_end keep it synced mid-turn.
  const sessionTime = sessionActiveMs;
  const showWaiting = processing
    && !permissionPrompt
    && !planInteraction
    && (!hasStreaming || processingText !== "Thinking...");

  // ── Auto-scroll to bottom, gated by user scroll position ──
  useLayoutEffect(() => {
    const visiblePlanId = plan?.planId;
    const planChanged = visiblePlanId !== undefined
      && visiblePlanId !== visiblePlanIdRef.current;
    visiblePlanIdRef.current = visiblePlanId;

    if ((isAtBottomRef.current || planChanged) && bottomRef.current) {
      bottomRef.current.scrollIntoView({
        behavior: hasStreaming || planChanged ? "instant" : "smooth",
      });
    }
  }, [messages, processing, permissionPrompt, plan, planInteraction]);

  const handleChatScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const wasAtBottom = isAtBottomRef.current;
    const nowAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 64;
    isAtBottomRef.current = nowAtBottom;

    // Immediate snap when user scrolls back to bottom during streaming
    if (!wasAtBottom && nowAtBottom && hasStreaming) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "instant" });
      });
    }
  }, [hasStreaming]);

  if (messages.length === 0 && !permissionPrompt && !planInteraction) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center" style={{ maxWidth: "520px", padding: "0 var(--space-xl)" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "50%", backgroundColor: "var(--color-accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 28px" }}>
            <span style={{ width: "22px", height: "22px", borderRadius: "3px", transform: "rotate(45deg)", background: "var(--color-accent)" }} />
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: 300, lineHeight: 1.3, color: "var(--color-text)", fontFamily: "var(--font-display)", marginBottom: "12px" }}>
            What would you like to{" "}<span style={{ fontWeight: 600 }}>create</span>{" "}today?
          </h1>
          <p style={{ fontSize: "14px", color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: "28px" }}>
            dscode is a digital studio for content-driven creation —{" "}code, write, design, and build with an AI that thinks like a maker.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {["Write code", "Refactor systems", "Design interfaces", "Analyze data", "Run commands"].map((cap) => (
              <span key={cap} style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "20px", border: "1px solid var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-muted)" }}>{cap}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const permissionOwnerAgent = findPermissionOwnerAgent(
    messages,
    permissionPrompt,
  );

  return (
    <div ref={(el) => { (scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el; if (containerRef) { (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el; } }} onScroll={handleChatScroll} className={"flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-4" + (scrollLocked ? " overflow-hidden pointer-events-none" : "")}>
      {messages.map((msg) => (
        <ErrorBoundary key={msg.id} fallback={<FallbackBubble message={msg} />}>
          {msg.role === "user"
            ? <UserBubble message={msg} />
            : msg.role === "system" && msg.id.startsWith("planning-mode-")
              ? <PlanningModeMarker />
            : msg.role === "system" && msg.id.startsWith("plan-ready-")
              ? <PlanReadyMarker text={msg.content} />
            : msg.role === "agent" && msg.agentActivity
              ? (
                  <AgentActivityCard
                    activity={msg.agentActivity}
                  />
                )
              : <AssistantMessage message={msg} />}
        </ErrorBoundary>
      ))}

      {plan && plan.items.length > 0 && <PlanTodoList plan={plan} />}

      {planInteraction && (
        <IntentAlignment
          key={planInteraction.interaction.interactionId}
          request={planInteraction.request}
          connected={alignmentConnected}
          conflicted={alignmentConflicted}
          onSubmit={onIntentAlignment}
        />
      )}

      {showWaiting && (
        <WaitingBubble label={processingText} sessionTime={sessionTime} />
      )}

      {permissionPrompt && permissionOwnerAgent && (
        <ToolApprovalCard
          permission={permissionPrompt}
          owner={permissionOwnerAgent}
          onDecision={onPermission}
        />
      )}

      {permissionPrompt && !permissionOwnerAgent && (
        <InlinePermission
          {...permissionPrompt}
          onDecision={onPermission}
        />
      )}

      <div ref={bottomRef} />
    </div>
  );
}

export function PlanTodoList({ plan }: { plan: Readonly<PlanRecord> }) {
  const completed = plan.items.filter((item) => item.status === "completed").length;
  const replanning = plan.status === "needs_replan"
    || (plan.baseRevision !== undefined
      && ["drafting", "awaiting_decision", "awaiting_approval"].includes(plan.status));
  const label = replanning
    ? "正在调整执行计划"
    : plan.status === "completed"
      ? "执行完成"
      : plan.status === "failed"
        ? "执行失败"
        : plan.status === "cancelled"
          ? "已取消"
          : plan.status === "approved"
            ? "准备执行"
            : "执行中";

  return (
    <section
      aria-label="TODO 执行清单"
      className="animate-fade-up"
      style={{
        borderLeft: "2px solid var(--color-accent)",
        padding: "2px 0 2px 14px",
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          TODO
        </span>
        <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {label} · {completed}/{plan.items.length}
        </span>
      </div>
      <ol className="space-y-2" aria-live="polite">
        {plan.items.map((item) => (
          <li
            key={item.itemId}
            className="grid items-start gap-2"
            style={{ gridTemplateColumns: "18px minmax(0, 1fr) auto" }}
          >
            <PlanItemStatusIcon status={item.status} />
            <span
              className="text-sm leading-5"
              style={{
                color: item.status === "completed"
                  ? "var(--color-text-muted)"
                  : "var(--color-text)",
                textDecoration: item.status === "completed" ? "line-through" : "none",
              }}
            >
              {item.title}
            </span>
            <span className="text-xs leading-5" style={{ color: "var(--color-text-muted)" }}>
              {planItemStatusLabel(item.status)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PlanItemStatusIcon({
  status,
}: {
  status: Readonly<PlanRecord>["items"][number]["status"];
}) {
  const props = { size: 16, weight: "bold" as const, "aria-hidden": true };
  if (status === "completed") {
    return <CheckCircle {...props} style={{ color: "var(--color-success-text)" }} />;
  }
  if (status === "in_progress") {
    return <SpinnerGap {...props} className="animate-spin" style={{ color: "var(--color-accent)" }} />;
  }
  if (status === "blocked") {
    return <WarningCircle {...props} style={{ color: "var(--color-error-text)" }} />;
  }
  if (status === "skipped") {
    return <MinusCircle {...props} style={{ color: "var(--color-text-muted)" }} />;
  }
  return <Circle {...props} style={{ color: "var(--color-text-muted)" }} />;
}

function planItemStatusLabel(
  status: Readonly<PlanRecord>["items"][number]["status"],
): string {
  switch (status) {
    case "pending": return "待执行";
    case "in_progress": return "执行中";
    case "blocked": return "受阻";
    case "completed": return "已完成";
    case "skipped": return "已跳过";
  }
}

// ── Error Boundary ──

class ErrorBoundary extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      console.error("[ChatView] render error:", this.state.error?.message);
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function FallbackBubble({ message }: { message: UIMessage }) {
  return (
    <div className="flex justify-start">
      <div
        data-collider="message-card"
        className="max-w-[85%] px-4 py-3"
        style={{
          borderRadius: "12px",
          border: "1px solid var(--color-error-text)",
          backgroundColor: "var(--color-error)",
          color: "var(--color-error-text)",
        }}
      >
        <div className="text-xs font-bold mb-1">Render Error</div>
        <div className="text-xs font-mono break-all">
          role={message.role} | content={String(message.content).slice(0, 60)}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──

function formatTime(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function waitingElapsedMs(
  sessionActiveMs: number,
  baselineActiveMs: number,
  baselineWallMs: number,
  nowMs: number,
): number {
  return Math.max(
    sessionActiveMs,
    baselineActiveMs + Math.max(0, nowMs - baselineWallMs),
  );
}

function PlanningModeMarker() {
  return (
    <div
      className="flex items-center gap-3 py-1 animate-fade-up"
      role="status"
      aria-label="进入 Planning Mode"
    >
      <span className="h-px flex-1" style={{ backgroundColor: "var(--color-border)" }} />
      <span
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium"
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "6px",
          color: "var(--color-text-muted)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ backgroundColor: "var(--color-accent)" }}
        />
        进入 Planning Mode
      </span>
      <span className="h-px flex-1" style={{ backgroundColor: "var(--color-border)" }} />
    </div>
  );
}

export function PlanReadyMarker({ text }: { text: string }) {
  return (
    <div
      className="flex items-center gap-3 py-1 animate-fade-up"
      role="status"
      aria-label={text}
    >
      <span className="h-px flex-1" style={{ backgroundColor: "var(--color-border)" }} />
      <span
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium"
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "6px",
          color: "var(--color-text-muted)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <CheckCircle
          size={15}
          weight="fill"
          aria-hidden
          style={{ color: "var(--color-success-text)" }}
        />
        {text}
      </span>
      <span className="h-px flex-1" style={{ backgroundColor: "var(--color-border)" }} />
    </div>
  );
}

function WaitingBubble({
  label,
  sessionTime,
}: {
  label: string;
  sessionTime: number;
}) {
  const baselineRef = useRef({
    activeMs: sessionTime,
    wallMs: Date.now(),
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const elapsedMs = waitingElapsedMs(
    sessionTime,
    baselineRef.current.activeMs,
    baselineRef.current.wallMs,
    now,
  );

  return (
    <div className="flex justify-start animate-fade-up">
      <div
        className="px-4 py-3"
        style={{
          borderRadius: "12px",
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-accent)", animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-accent)", animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-accent)", animationDelay: "300ms" }} />
          </div>
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{label}</span>
          <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>({formatTime(Math.floor(elapsedMs / 1000))})</span>
        </div>
      </div>
    </div>
  );
}

function UserBubble({ message }: { message: UIMessage }) {
  const safeContent = typeof message.content === "string" ? message.content : "";

  return (
    <div className="user-msg">
      <div className="meta">You{message.createdAt ? ` · ${new Date(message.createdAt).toLocaleTimeString()}` : ""}</div>
      <div data-collider="message-card" className="content">
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 justify-end">
            {message.images.map((img, i) => {
              const src = "data" in img
                ? `data:${img.mimeType};base64,${(img as any).data}`
                : undefined;
              return (
                <img
                  key={i}
                  data-collider="media-item"
                  src={src ?? "/placeholder-image.svg"}
                  alt={`Attached image ${i + 1}`}
                  className="max-w-[200px] max-h-[200px] object-cover rounded cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ border: "1px solid var(--color-border)" }}
                  onClick={() => src && window.open(src, "_blank")}
                />
              );
            })}
          </div>
        )}

        {safeContent ? (
          <Markdown className="text-sm leading-relaxed">{safeContent}</Markdown>
        ) : (
          message.isStreaming && !message.thinking && (!message.images || message.images.length === 0) ? (
            <span className="inline-block w-2 h-4 animate-pulse rounded-sm" style={{ backgroundColor: "var(--color-accent)" }} />
          ) : null
        )}
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: UIMessage }) {
  const safeContent = typeof message.content === "string" ? message.content : "";
  const hasThinking = !!message.thinking;
  const hasTools = !!(message.tools && message.tools.length > 0);
  const hasResponse = safeContent.length > 0;
  const isSimpleResponse = !hasThinking && !hasTools;

  return (
    <div className="assistant-msg">
      <div className="meta">dscode{message.createdAt ? ` · ${new Date(message.createdAt).toLocaleTimeString()}` : ""}</div>

      {hasThinking && (
        <>
          {!isSimpleResponse && (
            <div className="phase-label" data-collider="phase-label">
              <span className={`phase-dot ${message.isStreaming && message.thinking ? "active" : "done"}`} />
              <span className="phase-text">Thinking</span>
            </div>
          )}
          <ThinkingBlock
            thinking={message.thinking!}
            isStreaming={message.isStreaming}
            thinkingStartedAt={message.thinkingStartedAt}
            thinkingUpdatedAt={message.thinkingUpdatedAt}
          />
        </>
      )}

      {hasTools && (
        <>
          {!isSimpleResponse && (
            <div className="phase-label" data-collider="phase-label">
              <span className={`phase-dot ${message.isStreaming ? "active" : "done"}`} />
              <span className="phase-text">Executing</span>
            </div>
          )}
          <div className="space-y-2">
            {message.tools!.map((tool, i) => (
              <ToolCard key={`${tool.name}-${i}`} tool={tool} thinking={message.thinking} />
            ))}
          </div>
        </>
      )}

      {message.images && message.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {message.images.map((img, i) => {
            const src = "data" in img
              ? `data:${img.mimeType};base64,${(img as any).data}`
              : undefined;
            return (
              <img
                key={i}
                data-collider="media-item"
                src={src ?? "/placeholder-image.svg"}
                alt={`Attached image ${i + 1}`}
                className="max-w-[200px] max-h-[200px] object-cover rounded cursor-pointer hover:opacity-90 transition-opacity"
                style={{ border: "1px solid var(--color-border)" }}
                onClick={() => src && window.open(src, "_blank")}
              />
            );
          })}
        </div>
      )}

      {(hasResponse || (hasTools && message.isStreaming)) && (
        <div className="phase-label" data-collider="phase-label">
          <span className={`phase-dot ${message.isStreaming && !message.thinking ? "active" : "done"}`} />
          <span className="phase-text">Response</span>
        </div>
      )}

      <div className="text-response">
        {safeContent ? (
          <Markdown isStreaming={message.isStreaming} className="text-sm leading-relaxed">{safeContent}</Markdown>
        ) : (
          message.isStreaming && !message.thinking && (!message.images || message.images.length === 0) ? (
            <span className="inline-block w-2 h-4 animate-pulse rounded-sm" style={{ backgroundColor: "var(--color-accent)" }} />
          ) : null
        )}
      </div>
    </div>
  );
}

const STALL_THRESHOLD_MS = 15000;

function ThinkingBlock({
  thinking,
  isStreaming,
  thinkingStartedAt,
  thinkingUpdatedAt,
}: {
  thinking: string;
  isStreaming?: boolean;
  thinkingStartedAt?: number;
  thinkingUpdatedAt?: number;
}) {
  const [collapsed, setCollapsed] = useState(!isStreaming);
  const [tick, setTick] = useState(0);
  const lastLiveElapsedRef = useRef<number | null>(null);

  // auto-expand when streaming starts
  useEffect(() => {
    if (isStreaming) setCollapsed(false);
  }, [isStreaming]);

  // local 1s tick during streaming for live timer and stall detection
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  // compute live elapsed from per-thinking anchor
  const liveElapsed = (isStreaming && thinkingStartedAt != null)
    ? Math.round((Date.now() - thinkingStartedAt) / 1000)
    : null;

  // track last live elapsed for freeze-on-completion
  if (liveElapsed != null) {
    lastLiveElapsedRef.current = liveElapsed;
  }

  // freeze when thinking segment ends (thinkingStartedAt cleared by reducer)
  const isFrozen = !!thinking && thinkingStartedAt == null;
  const frozenElapsed = isFrozen ? lastLiveElapsedRef.current : null;
  const displayElapsed = isFrozen ? frozenElapsed : liveElapsed;
  const isDone = isFrozen && frozenElapsed != null;

  // stall detection: no delta for >15s during live streaming
  const isStalled = isStreaming && thinkingStartedAt != null && thinkingUpdatedAt != null
    && (Date.now() - thinkingUpdatedAt) > STALL_THRESHOLD_MS;
  const stallSeconds = isStalled
    ? Math.round((Date.now() - (thinkingUpdatedAt ?? Date.now())) / 1000)
    : 0;

  const isLiveStreaming = isStreaming && thinkingStartedAt != null;

  return (
    <div
      className={`thinking${collapsed ? " collapsed" : ""}${isStalled ? " stalled" : ""}${isDone ? " done" : ""}${isLiveStreaming ? " streaming" : ""}`}
      data-collider="thinking-block"
    >
      <div className="label" onClick={() => setCollapsed(!collapsed)}>
        <span className="dot" />
        {isDone
          ? `Thought for ${formatTime(frozenElapsed!)}`
          : isLiveStreaming && displayElapsed != null
            ? <>Thinking <span className="elapsed">· {formatTime(displayElapsed)}</span></>
            : "Thinking"
        }
        {isStalled && <span className="stall-note"> · no output for {formatTime(stallSeconds)}</span>}
      </div>
      <div className="thinking-body">{thinking}</div>
    </div>
  );
}
