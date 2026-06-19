import { useState, useRef, useCallback } from "react";
import type { ContextWindowData } from "../types";

interface ContextWindowBarProps {
  data: ContextWindowData | null;
}

const CATEGORY_KEYS = [
  "system",
  "rules",
  "user",
  "thinking",
  "readwrite",
  "edit",
  "shell",
  "skill",
  "mcp",
  "other",
] as const;

type CategoryKey = (typeof CATEGORY_KEYS)[number];

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  system: "System",
  rules: "Rules",
  user: "User",
  thinking: "Thinking",
  readwrite: "Read/Write",
  edit: "Edit",
  shell: "Shell",
  skill: "Skill",
  mcp: "MCP",
  other: "Other",
};

const CATEGORY_CSS_VARS: Record<CategoryKey, string> = {
  system: "var(--cw-system)",
  rules: "var(--cw-rules)",
  user: "var(--cw-user)",
  thinking: "var(--cw-thinking)",
  readwrite: "var(--cw-readwrite)",
  edit: "var(--cw-edit)",
  shell: "var(--cw-shell)",
  skill: "var(--cw-skill)",
  mcp: "var(--cw-mcp)",
  other: "var(--cw-other)",
};

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(1) + "M";
  }
  if (n >= 1_000) {
    return (n / 1_000).toFixed(1) + "k";
  }
  return (n / 1_000).toFixed(1) + "k";
}

export function ContextWindowBar({ data }: ContextWindowBarProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => setShowTooltip(true), []);
  const handleMouseLeave = useCallback(() => setShowTooltip(false), []);

  if (!data) return null;

  const { total, used, free, categories } = data;
  const MIN_WIDTH_PX = 2;

  const segments = CATEGORY_KEYS.map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
    tokens: categories[key],
    color: CATEGORY_CSS_VARS[key],
  })).filter((s) => s.tokens > 0);

  const usedPct = total > 0 ? (used / total) * 100 : 0;

  const barWidthEstimate = 260;
  const minPct = (MIN_WIDTH_PX / barWidthEstimate) * 100;

  let adjustedPercentages = segments.map((_s, i) => {
    const rawPct = total > 0 ? (segments[i].tokens / total) * 100 : 0;
    return rawPct > 0 && rawPct < minPct ? minPct : rawPct;
  });

  const adjTotal = adjustedPercentages.reduce((a, b) => a + b, 0);
  if (adjTotal > usedPct && adjTotal > 0) {
    const scale = usedPct / adjTotal;
    adjustedPercentages = adjustedPercentages.map((p) => p * scale);
  }

  const freePct = total > 0 ? Math.max(0, 100 - usedPct) : 100;

  return (
    <div
      className="relative flex items-center gap-2"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        className="text-xs shrink-0 select-none tabular-nums"
        style={{ color: "var(--color-text-muted)" }}
      >
        {formatTokenCount(used)}&nbsp;/&nbsp;{formatTokenCount(total)}
      </span>

      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <span
          className="text-[10px] leading-none select-none"
          style={{ color: "var(--color-text-muted)" }}
        >
          Context Window
        </span>
        <div
          ref={barRef}
          className="flex shrink-0 overflow-hidden"
        style={{
          width: "260px",
          height: "22px",
          backgroundColor: "var(--color-border)",
          gap: "1px",
        }}
        >
        {segments.map((seg, i) => (
          <div
            key={seg.key}
            className=""
            style={{
              width: `${adjustedPercentages[i]}%`,
              backgroundColor: seg.color,
              minWidth: seg.tokens > 0 ? `${MIN_WIDTH_PX}px` : 0,
              transition: "width 0.3s ease, background-color 0.3s ease",
            }}
            title={`${seg.label}: ${formatTokenCount(seg.tokens)}`}
          />
        ))}
        {freePct > 0 && (
          <div
            className=""
            style={{
              flex: 1,
              backgroundColor: "transparent",
              transition: "width 0.3s ease",
            }}
          />
        )}
      </div>
      </div>
      {showTooltip && (
        <div
          className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 p-3 rounded-lg shadow-lg"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            minWidth: "220px",
          }}
        >
          <div className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
            Context window (estimated)
          </div>
          <div className="flex flex-col gap-1.5">
            {segments.map((seg) => (
              <div key={seg.key} className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text)" }}>
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
                <span className="flex-1">{seg.label}</span>
                <span className="tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                  {formatTokenCount(seg.tokens)}
                </span>
              </div>
            ))}
            {free > 0 && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text)" }}>
                <span className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ border: "1px dashed var(--color-border)", backgroundColor: "transparent" }} />
                <span className="flex-1">Free</span>
                <span className="tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                  {formatTokenCount(free)}
                </span>
              </div>
            )}
          </div>
          <div className="text-xs mt-2 pt-2 flex justify-between tabular-nums"
            style={{ color: "var(--color-text-muted)", borderTop: "1px solid var(--color-border)" }}>
            <span>{used > 0 ? `${((used / total) * 100).toFixed(0)}% used` : ""}</span>
            <span>Total: {formatTokenCount(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
