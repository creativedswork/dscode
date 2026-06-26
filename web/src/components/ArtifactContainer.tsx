import { useRef, useEffect, useMemo } from "react";

interface ArtifactContainerProps {
  html: string;
  loading: boolean;
}

function cleanHtml(raw: string): string {
  let h = raw.trim();
  // Strip markdown fences
  h = h.replace(/^```(?:html|HTML)?\s*\n?/, "");
  h = h.replace(/\n?```\s*$/, "");
  // If result doesn't look like HTML, return as-is (will show in pre tag)
  return h;
}

export function ArtifactContainer({ html, loading }: ArtifactContainerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cleanedHtml = useMemo(() => {
    if (loading || !html) return "";
    return cleanHtml(html);
  }, [html, loading]);

  useEffect(() => {
    if (iframeRef.current && cleanedHtml) {
      iframeRef.current.srcdoc = cleanedHtml;
    }
  }, [cleanedHtml]);

  if (loading || !cleanedHtml) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-accent)", animationDelay: "0ms" }} />
            <span className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-accent)", animationDelay: "150ms" }} />
            <span className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-accent)", animationDelay: "300ms" }} />
          </div>
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>Generating dashboard...</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ backgroundColor: "var(--color-bg)" }}>
      <iframe
        ref={iframeRef}
        srcDoc={cleanedHtml}
        sandbox="allow-same-origin"
        className="flex-1 w-full border-0"
        style={{ backgroundColor: "var(--color-bg)", minHeight: "100%" }}
        title="Dashboard Artifact"
      />
      {/* Debug: show raw HTML size */}
      <div className="text-xs px-2 py-0.5" style={{ color: "var(--color-text-muted)", borderTop: "1px solid var(--color-border)" }}>
        {cleanedHtml.length} bytes
      </div>
    </div>
  );
}
