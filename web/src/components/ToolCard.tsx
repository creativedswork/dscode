import { useState, useMemo, useEffect, useRef } from "react";
import type { ToolCallEntry } from "../types";
import { Markdown } from "./Markdown";

interface ToolCardProps {
  tool: ToolCallEntry;
  thinking?: string;
}

interface ParsedImage {
  data: string;
  mimeType: string;
}

function extractImages(text: string): { images: ParsedImage[]; cleanedText: string } {
  const images: ParsedImage[] = [];
  const dataUriRegex = /data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=]+)/g;
  let cleaned = text;
  let match: RegExpExecArray | null;
  while ((match = dataUriRegex.exec(text)) !== null) {
    images.push({ mimeType: match[1], data: match[2] });
  }
  cleaned = cleaned.replace(dataUriRegex, "[Image]");

  if (images.length === 0 && text.length > 100 && /^[A-Za-z0-9+/=]+\n?$/.test(text.trim())) {
    const trimmed = text.trim();
    if (trimmed.startsWith("iVBOR")) {
      images.push({ data: trimmed, mimeType: "image/png" });
      cleaned = "[Image]";
    } else if (trimmed.startsWith("/9j/")) {
      images.push({ data: trimmed, mimeType: "image/jpeg" });
      cleaned = "[Image]";
    } else if (trimmed.startsWith("R0lGOD")) {
      images.push({ data: trimmed, mimeType: "image/gif" });
      cleaned = "[Image]";
    } else if (trimmed.startsWith("UklGR")) {
      images.push({ data: trimmed, mimeType: "image/webp" });
      cleaned = "[Image]";
    }
  }

  return { images, cleanedText: cleaned };
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return "0s";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
}

function tryParseJSON(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// ── MCP Rich List helpers ──

interface RichItem {
  title?: string;
  score?: number | string;
  url?: string;
  content?: string;
  metaFields?: { label: string; value: string }[];
}

function extractRichItems(data: unknown): RichItem[] {
  const items: RichItem[] = [];

  const extract = (obj: Record<string, unknown>): RichItem => {
    const item: RichItem = {};
    const metaFields: { label: string; value: string }[] = [];

    for (const [key, value] of Object.entries(obj)) {
      if (value == null) continue;
      const kl = key.toLowerCase();
      if (kl === "title" || kl === "name" || kl === "label") {
        item.title = String(value);
      } else if (kl === "score" || kl === "relevance" || kl === "rank") {
        const num = Number(value);
        item.score = Number.isFinite(num) ? num.toFixed(2) : String(value);
      } else if (kl === "url" || kl === "link" || kl === "href") {
        item.url = String(value);
      } else if (kl === "content" || kl === "snippet" || kl === "summary" || kl === "description" || kl === "text" || kl === "body") {
        item.content = String(value);
      } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        metaFields.push({ label: key, value: String(value) });
      }
    }

    if (metaFields.length > 0) item.metaFields = metaFields;
    return item;
  };

  if (Array.isArray(data)) {
    for (const entry of data) {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        items.push(extract(entry as Record<string, unknown>));
      }
    }
  } else if (data && typeof data === "object") {
    // Try to find an array field that could be results
    const obj = data as Record<string, unknown>;
    for (const [, value] of Object.entries(obj)) {
      if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object") {
        for (const entry of value) {
          if (entry && typeof entry === "object" && !Array.isArray(entry)) {
            items.push(extract(entry as Record<string, unknown>));
          }
        }
        break;
      }
    }
    if (items.length === 0) {
      items.push(extract(obj));
    }
  }

  return items;
}

function RichListItem({ item }: { item: RichItem }) {
  const hasContentParagraphs = item.content && item.content.includes('\n');

  return (
    <div className="mcp-rich-item" data-collider="tool-result-line">
      <div className="r-head">
        {item.title && <span className="r-title">{item.title}</span>}
        {item.score !== undefined && <span className="r-score">{item.score}</span>}
      </div>
      {item.url && <div className="r-url">{item.url}</div>}
      {item.content && (
        <div className="r-content">
          {hasContentParagraphs
            ? item.content.split('\n').map((p, i) => <p key={i}>{p}</p>)
            : <p>{item.content}</p>
          }
        </div>
      )}
      {item.metaFields && item.metaFields.length > 0 && (
        <div className="r-meta-row">
          {item.metaFields.map((mf, i) => (
            <span key={i}>{mf.label}: {mf.value}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToolCard({ tool, thinking }: ToolCardProps) {
  const isError = tool.isError;
  const hasResult = tool.result && tool.result.length > 0;
  const isMcp = tool.name.startsWith("mcp__");
  const hasMcpApp = !!tool.mcpApp;
  const [open, setOpen] = useState(isMcp && !hasResult);
  const userManuallyCollapsed = useRef(false);
  const hasProgress = typeof tool.progress === "number";
  const hasProgressTotal = typeof tool.progressTotal === "number" && tool.progressTotal > 0;
  const progressPercent = hasProgressTotal
    ? Math.max(0, Math.min(100, Math.round((tool.progress! / tool.progressTotal!) * 100)))
    : 0;
  const isIndeterminate = hasProgress && !hasProgressTotal;

  // Elapsed time tracking
  const startTimeRef = useRef<number>(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!isMcp || hasResult) return;
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [isMcp, hasResult]);
  const elapsedText = hasResult ? "" : formatElapsed(elapsedMs);

  // Auto-expand on first progress, respect manual collapse
  const hadProgressRef = useRef(hasProgress);
  useEffect(() => {
    if (hasProgress && !hadProgressRef.current && !userManuallyCollapsed.current) {
      setOpen(true);
    }
    hadProgressRef.current = hasProgress;
  }, [hasProgress]);

  const handleHeaderClick = () => {
    if (open) {
      userManuallyCollapsed.current = true;
    } else {
      userManuallyCollapsed.current = false;
    }
    setOpen(!open);
  };

  // Determine status icon
  const statusIcon = isError
    ? "\u2717"
    : hasResult && !isError
    ? "\u2713"
    : "\u25CC";
  const statusClass = isError ? "err" : "ok";
  const spinnerClass = hasProgress && !hasResult ? " spinner" : "";

  const images = useMemo(() => {
    if (tool.images && tool.images.length > 0) {
      return tool.images.map((img) => ({ data: img.data, mimeType: img.mimeType }));
    }
    if (!hasResult || hasMcpApp) return null;
    const parsed = extractImages(tool.result);
    return parsed.images.length > 0 ? parsed.images : null;
  }, [tool.images, tool.result, hasResult, hasMcpApp]);

  const mcpResult = useMemo(() => {
    if (!isMcp || !hasResult || hasMcpApp) return null;
    return tryParseJSON(tool.result);
  }, [isMcp, hasResult, hasMcpApp, tool.result]);

  const richItems = useMemo(() => {
    if (!mcpResult) return null;
    return extractRichItems(mcpResult);
  }, [mcpResult]);

  const hasRichList = richItems && richItems.length > 0;

  return (
    <div
      data-collider="tool-card"
      className={`tool-card${isMcp ? " mcp" : ""}${open ? " open" : ""}`}
    >
      <div
        data-collider="tool-header"
        className="tool-card-header"
        onClick={handleHeaderClick}
      >
        <span className={`status ${statusClass}${spinnerClass}`}>
          {statusIcon}
        </span>
        <span className="name">{tool.name}</span>
        {isMcp && <span className="mcp-badge">MCP</span>}
        {tool.args && <span className="args">{tool.args}</span>}
        {/* Mini progress bar in collapsed header */}
        {!open && hasProgress && (
          <span className="mini-progress-bar">
            <span className="mini-progress-bar-track">
              <span
                className={`mini-progress-fill${isIndeterminate ? " indeterminate" : ""}`}
                style={isIndeterminate ? undefined : { width: `${progressPercent}%` }}
              />
            </span>
            {!isIndeterminate && (
              <span className="mini-progress-text">{progressPercent}%</span>
            )}
          </span>
        )}
        <span className="arrow">{"\u25BE"}</span>
      </div>

      <div className="tool-card-body">
        {/* Execution Card for in-progress MCP tools */}
        {isMcp && !hasResult && (
          <div className="exec-card" data-collider="exec-card">
            <div className="exec-card-top">
              <span className="exec-card-label">
                <span className="exec-pulse-dot" />
                Live · {hasProgress ? "executing" : "waiting"}
              </span>
              {elapsedText && (
                <span className="exec-elapsed">{elapsedText}</span>
              )}
            </div>
            {!hasProgress ? (
              <span className="exec-waiting-text">Waiting for execution to begin…</span>
            ) : (
              <div className="exec-progress-section">
                <div className="progress-bar">
                  <div
                    className={`progress-fill${isIndeterminate ? " indeterminate" : ""}`}
                    style={isIndeterminate ? undefined : { width: `${progressPercent}%` }}
                  />
                </div>
                <div className="exec-progress-footer">
                  {!isIndeterminate && (
                    <span className="progress-text">{progressPercent}%</span>
                  )}
                  {tool.progressMessage && (
                    <span className="progress-message">{tool.progressMessage}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {images && images.length > 0 && (
          <div style={{ padding: "8px 14px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {images.map((img, i) => (
              <img
                key={i}
                data-collider="media-item"
                src={`data:${img.mimeType};base64,${img.data}`}
                alt={`Tool result image ${i + 1}`}
                className="max-w-[300px] max-h-[300px] object-contain rounded cursor-pointer hover:opacity-90 transition-opacity"
                style={{ border: "1px solid var(--color-border)", backgroundColor: "var(--color-surface)" }}
                onClick={() => window.open(`data:${img.mimeType};base64,${img.data}`, "_blank")}
              />
            ))}
          </div>
        )}

        {hasResult && !hasMcpApp && !isMcp && (
          <div className="tool-card-body-inner" data-collider="tool-result-line">
            <Markdown className="text-xs">{tool.result}</Markdown>
          </div>
        )}

        {isMcp && hasRichList && (
          <div className="mcp-rich-list">
            {richItems!.map((item, i) => (
              <RichListItem key={i} item={item} />
            ))}
          </div>
        )}

        {isMcp && !hasRichList && hasResult && (
          <div className="mcp-raw-block" data-collider="tool-result-line">
            <Markdown className="text-xs">{tool.result}</Markdown>
          </div>
        )}
      </div>

      {hasMcpApp && open && (
        <div style={{ padding: "0 14px 12px" }}>
          <iframe
            src={tool.mcpApp!.appUrl}
            className="w-full rounded border"
            style={{
              minHeight: "480px",
              height: "60vh",
              maxHeight: "700px",
              borderColor: "var(--color-border)",
              backgroundColor: "#fff",
            }}
            sandbox="allow-scripts allow-same-origin"
            title={`MCP App: ${tool.name}`}
          />
        </div>
      )}
    </div>
  );
}
