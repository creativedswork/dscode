import { useState } from "react";
import type { ToolCallEntry } from "../types";

interface ToolCardProps {
  tool: ToolCallEntry;
}

export function ToolCard({ tool }: ToolCardProps) {
  const isError = tool.isError;
  const hasResult = tool.result && tool.result.length > 0;
  const hasMcpApp = !!tool.mcpApp;
  const [appExpanded, setAppExpanded] = useState(false);

  return (
    <div
      className={`text-xs rounded-lg p-2.5 ${
        isError
          ? "bg-red-900/20 border border-red-900/40"
          : "bg-gray-800/50 border border-dscode-border"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={isError ? "text-dscode-red" : "text-dscode-green"}>
          {isError ? "✗" : "✓"}
        </span>
        <span className="font-mono font-medium text-dscode-accent">{tool.name}</span>
        {tool.args && (
          <span className="text-dscode-muted truncate max-w-[200px]">
            {tool.args}
          </span>
        )}
        {hasMcpApp && (
          <button
            onClick={() => setAppExpanded(!appExpanded)}
            className="ml-auto px-2 py-0.5 text-xs rounded bg-dscode-accent/20 text-dscode-accent hover:bg-dscode-accent/30 transition-colors"
          >
            {appExpanded ? "Hide App ▲" : "Open App ▼"}
          </button>
        )}
      </div>

      {hasResult && !hasMcpApp && (
        <div className={`mt-1.5 font-mono ${isError ? "text-dscode-red" : "text-dscode-text"}`}>
          <span className="text-dscode-muted">→ </span>
          {tool.result}
        </div>
      )}

      {hasMcpApp && appExpanded && (
        <div className="mt-2">
          <iframe
            src={tool.mcpApp!.appUrl}
            className="w-full rounded border border-dscode-border bg-white dark:bg-gray-900"
            style={{ minHeight: "480px", height: "60vh", maxHeight: "700px" }}
            sandbox="allow-scripts allow-same-origin"
            title={`MCP App: ${tool.name}`}
          />
        </div>
      )}
    </div>
  );
}
