import { useState, useMemo } from "react";
import type { ToolCallEntry } from "../types";
import { Markdown } from "./Markdown";

interface ToolCardProps {
  tool: ToolCallEntry;
}

interface ParsedImage {
  data: string;
  mimeType: string;
}

function extractImages(text: string): { images: ParsedImage[]; cleanedText: string } {
  const images: ParsedImage[] = [];
  const dataUriRegex = /data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=]+)/g;
  let match: RegExpExecArray | null;
  let cleaned = text;
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

export function ToolCard({ tool }: ToolCardProps) {
  const isError = tool.isError;
  const hasResult = tool.result && tool.result.length > 0;
  const hasMcpApp = !!tool.mcpApp;
  const [appExpanded, setAppExpanded] = useState(false);

  const images = useMemo(() => {
    if (tool.images && tool.images.length > 0) {
      return tool.images.map((img) => ({ data: img.data, mimeType: img.mimeType }));
    }
    if (!hasResult || hasMcpApp) return null;
    const parsed = extractImages(tool.result);
    return parsed.images.length > 0 ? parsed.images : null;
  }, [tool.images, tool.result, hasResult, hasMcpApp]);

  const displayText = useMemo(() => {
    if (tool.images && tool.images.length > 0) {
      return `Image: ${tool.images.length} image(s)`;
    }
    if (!hasResult || hasMcpApp) return tool.result;
    const parsed = extractImages(tool.result);
    return parsed.cleanedText;
  }, [tool.images, tool.result, hasResult, hasMcpApp]);

  return (
    <div
      data-collider="tool-card"
      className="text-xs p-2.5 min-w-0"
      style={{
        borderRadius: "8px",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color: isError ? "var(--color-error-text)" : "var(--color-success-text)" }}>
          {isError ? "\u2717" : "\u2713"}
        </span>
        <span className="font-mono font-medium" style={{ color: "var(--color-accent)" }}>
          {tool.name}
        </span>
        {tool.args && (
          <span className="truncate max-w-[200px]" style={{ color: "var(--color-text-muted)" }}>
            {tool.args}
          </span>
        )}
        {hasMcpApp && (
          <button
            onClick={() => setAppExpanded(!appExpanded)}
            className="ml-auto px-2 py-0.5 text-xs rounded-btn transition-colors duration-200"
            style={{ backgroundColor: "var(--color-surface-hover)", color: "var(--color-accent)" }}
          >
            {appExpanded ? "Hide App" : "Open App"}
          </button>
        )}
      </div>

      {images && images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((img, i) => (
            <img
              key={i}
              src={`data:${img.mimeType};base64,${img.data}`}
              alt={`Tool result image ${i + 1}`}
              className="max-w-[300px] max-h-[300px] object-contain rounded cursor-pointer hover:opacity-90 transition-opacity"
              style={{ border: "1px solid var(--color-border)", backgroundColor: "var(--color-surface)" }}
              onClick={() => window.open(`data:${img.mimeType};base64,${img.data}`, "_blank")}
            />
          ))}
        </div>
      )}

      {hasResult && !hasMcpApp && (
        <div
          className="mt-1.5 max-h-40 overflow-y-auto"
          style={{ color: isError ? "var(--color-error-text)" : "var(--color-text)" }}
        >
          <span style={{ color: "var(--color-text-muted)" }}>&rarr; </span>
          <Markdown className="text-xs">{displayText}</Markdown>
        </div>
      )}

      {hasMcpApp && appExpanded && (
        <div className="mt-2">
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
