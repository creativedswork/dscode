import type { ToolCallEntry } from "../types";

interface ToolCardProps {
  tool: ToolCallEntry;
}

export function ToolCard({ tool }: ToolCardProps) {
  const isError = tool.isError;
  const hasResult = tool.result && tool.result.length > 0;

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
      </div>
      {hasResult && (
        <div className={`mt-1.5 font-mono ${isError ? "text-dscode-red" : "text-dscode-text"}`}>
          <span className="text-dscode-muted">→ </span>
          {tool.result}
        </div>
      )}
    </div>
  );
}
