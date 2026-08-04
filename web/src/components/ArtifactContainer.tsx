import { useMemo } from "react";

export interface ArtifactPresentation {
  kind: "session_dashboard" | "eval_dashboard";
  html: string;
  loading: boolean;
}

interface ArtifactContainerProps {
  presentation: ArtifactPresentation;
}

function cleanHtml(raw: string): string {
  let h = raw.trim();
  // Strip markdown fences
  h = h.replace(/^```(?:html|HTML)?\s*\n?/, "");
  h = h.replace(/\n?```\s*$/, "");
  // If result doesn't look like HTML, return as-is (will show in pre tag)
  return h;
}

export function ArtifactContainer({ presentation }: ArtifactContainerProps) {
  const { kind, html, loading } = presentation;
  const renderedHtml = useMemo(() => {
    if (loading || !html) return "";
    return kind === "eval_dashboard" ? html : cleanHtml(html);
  }, [html, kind, loading]);

  if (loading || !renderedHtml) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-accent)", animationDelay: "0ms" }} />
            <span className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-accent)", animationDelay: "150ms" }} />
            <span className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-accent)", animationDelay: "300ms" }} />
          </div>
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {kind === "eval_dashboard" ? "Loading evaluation report..." : "Generating dashboard..."}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ backgroundColor: "var(--color-bg)" }}>
      <iframe
        srcDoc={renderedHtml}
        sandbox="allow-same-origin"
        className="flex-1 w-full border-0"
        style={{ backgroundColor: "var(--color-bg)", minHeight: "100%" }}
        title={kind === "eval_dashboard" ? "CHIEF evaluation report" : "Session Dashboard"}
      />
      {kind === "session_dashboard" && (
        <div className="text-xs px-2 py-0.5" style={{ color: "var(--color-text-muted)", borderTop: "1px solid var(--color-border)" }}>
          {renderedHtml.length} bytes
        </div>
      )}
    </div>
  );
}
