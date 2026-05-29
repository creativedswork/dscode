import { useState, useMemo } from "react";
import type { ToolCallEntry } from "../types";

interface ToolCardProps {
  tool: ToolCallEntry;
}

interface ParsedImage {
  data: string;
  mimeType: string;
}

/** Try to parse base64 images from tool result. Supports:
 *  - Raw base64 image data (detected by common image prefixes)
 *  - data:image/...;base64,... URIs embedded in text
 */
function extractImages(text: string): { images: ParsedImage[]; cleanedText: string } {
  const images: ParsedImage[] = [];
  // Match data:image URIs
  const dataUriRegex = /data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=]+)/g;
  let match: RegExpExecArray | null;
  let cleaned = text;
  while ((match = dataUriRegex.exec(text)) !== null) {
    images.push({ mimeType: match[1], data: match[2] });
  }
  // Remove the data URIs from display text to avoid huge base64 strings
  cleaned = cleaned.replace(dataUriRegex, "[Image]");
  
  // If text looks like pure base64 image data (starts with common base64 image header)
  if (images.length === 0 && text.length > 100 && /^[A-Za-z0-9+/=]+\n?$/.test(text.trim())) {
    // Try to detect image type from base64 header bytes
    const trimmed = text.trim();
    // PNG: starts with iVBOR
    if (trimmed.startsWith("iVBOR")) {
      images.push({ data: trimmed, mimeType: "image/png" });
      cleaned = "[Image]";
    }
    // JPEG: starts with /9j/
    else if (trimmed.startsWith("/9j/")) {
      images.push({ data: trimmed, mimeType: "image/jpeg" });
      cleaned = "[Image]";
    }
    // GIF: starts with R0lGOD
    else if (trimmed.startsWith("R0lGOD")) {
      images.push({ data: trimmed, mimeType: "image/gif" });
      cleaned = "[Image]";
    }
    // WebP: starts with UklGR
    else if (trimmed.startsWith("UklGR")) {
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
  const [imageExpanded, setImageExpanded] = useState(false);

  const parsed = useMemo(() => {
    if (!hasResult || hasMcpApp) return null;
    return extractImages(tool.result);
  }, [tool.result, hasResult, hasMcpApp]);

  return (
    <div
      className="text-xs p-2.5 min-w-0"
      style={{
        borderRadius: "8px",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          style={{
            color: isError ? "var(--color-error-text)" : "var(--color-success-text)",
          }}
        >
          {isError ? "\u2717" : "\u2713"}
        </span>
        <span
          className="font-mono font-medium"
          style={{ color: "var(--color-accent)" }}
        >
          {tool.name}
        </span>
        {tool.args && (
          <span
            className="truncate max-w-[200px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            {tool.args}
          </span>
        )}
        {hasMcpApp && (
          <button
            onClick={() => setAppExpanded(!appExpanded)}
            className="ml-auto px-2 py-0.5 text-xs rounded-btn transition-colors duration-200"
            style={{
              backgroundColor: "var(--color-surface-hover)",
              color: "var(--color-accent)",
            }}
          >
            {appExpanded ? "Hide App" : "Open App"}
          </button>
        )}
        {parsed && parsed.images.length > 0 && (
          <button
            onClick={() => setImageExpanded(!imageExpanded)}
            className="ml-auto px-2 py-0.5 text-xs rounded-btn transition-colors duration-200"
            style={{
              backgroundColor: "var(--color-surface-hover)",
              color: "var(--color-accent)",
            }}
          >
            {imageExpanded ? "Hide Image" : `View Image (${parsed.images.length})`}
          </button>
        )}
      </div>

      {parsed && parsed.images.length > 0 && imageExpanded && (
        <div className="mt-2 flex flex-wrap gap-2">
          {parsed.images.map((img, i) => (
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
          className="mt-1.5 font-mono break-all whitespace-pre-wrap max-h-40 overflow-y-auto"
          style={{
            color: isError ? "var(--color-error-text)" : "var(--color-text)",
          }}
        >
          <span style={{ color: "var(--color-text-muted)" }}>&rarr; </span>
          {parsed ? parsed.cleanedText : tool.result}
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
