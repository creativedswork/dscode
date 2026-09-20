import { useEffect, useRef, useState } from "react";

import type { PlanDecisionRequest } from "../types";
import type { IntentAlignmentAnswer } from "../utils/intentAlignment";

interface IntentAlignmentProps {
  request: Readonly<PlanDecisionRequest>;
  connected: boolean;
  conflicted: boolean;
  onSubmit(answer: IntentAlignmentAnswer): boolean;
}

function initialOptionId(request: Readonly<PlanDecisionRequest>): string | null {
  return request.candidates.find((candidate) => candidate.recommended)?.optionId
    ?? request.candidates[0]?.optionId
    ?? null;
}

export function IntentAlignment({
  request,
  connected,
  conflicted,
  onSubmit,
}: IntentAlignmentProps) {
  const options = request.candidates.slice(0, 3);
  const [selectedOptionId, setSelectedOptionId] = useState(
    initialOptionId(request),
  );
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState(false);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setSelectedOptionId(initialOptionId(request));
    setCustomText("");
    setBusy(false);
  }, [request.interactionId, request.version]);

  useEffect(() => {
    // #region debug-point C,D:web-render
    void fetch("http://127.0.0.1:7777/event", { method: "POST", body: JSON.stringify({ sessionId: "alignment-recommendation-missing", runId: "post-fix", hypothesisId: "C,D", location: "web/src/components/IntentAlignment.tsx:render", msg: "[DEBUG] Web candidate recommendations", data: { interactionId: request.interactionId, candidates: request.candidates.map((candidate) => ({ optionId: candidate.optionId, recommended: candidate.recommended })), recommendationMarkupExpected: request.candidates.some((candidate) => candidate.recommended) }, ts: Date.now() }) }).catch(() => {});
    // #endregion
  }, [request.interactionId, request.version]);

  const submit = (answer: IntentAlignmentAnswer) => {
    if (!connected || busy || !onSubmit(answer)) return;
    setBusy(true);
  };

  const confirmSelection = () => {
    if (selectedOptionId) {
      submit({ kind: "select", optionId: selectedOptionId });
    }
  };

  const confirmCustom = () => {
    const text = customText.trim();
    if (text) submit({ kind: "custom", text });
  };

  const moveSelection = (current: number, delta: -1 | 1) => {
    const next = (current + delta + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    setSelectedOptionId(option.optionId);
    optionRefs.current[next]?.focus();
  };

  const recommendation = options.find((candidate) => candidate.recommended);

  return (
    <section
      className="intent-alignment"
      aria-labelledby={`alignment-${request.interactionId}`}
    >
      <div className="meta">dscode</div>
      <div className="intent-alignment-body">
        <h2 id={`alignment-${request.interactionId}`}>{request.prompt}</h2>
        {recommendation && (
          <p className="intent-alignment-recommendation">
            建议从<strong>{recommendation.summary}</strong>开始。
          </p>
        )}
        <div
          className="intent-alignment-options"
          role="radiogroup"
          aria-label={request.prompt}
        >
          {options.map((option, index) => {
            const selected = option.optionId === selectedOptionId;
            return (
              <button
                key={option.optionId}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                disabled={!connected || busy}
                onClick={() => setSelectedOptionId(option.optionId)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                    event.preventDefault();
                    moveSelection(index, 1);
                  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                    event.preventDefault();
                    moveSelection(index, -1);
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    submit({ kind: "select", optionId: option.optionId });
                  }
                }}
              >
                <span>{option.summary}</span>
                {option.recommended && <small>推荐</small>}
              </button>
            );
          })}
        </div>
        <div className="intent-alignment-actions">
          <input
            value={customText}
            aria-label="自定义方向"
            placeholder="或补充你的具体要求"
            disabled={!connected || busy}
            onChange={(event) => setCustomText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                confirmCustom();
              }
            }}
          />
          <button
            type="button"
            disabled={
              !connected
              || busy
              || (!selectedOptionId && !customText.trim())
            }
            onClick={customText.trim() ? confirmCustom : confirmSelection}
          >
            {busy ? "正在提交" : "采用此方向"}
          </button>
        </div>
        {!connected && <p className="intent-alignment-status">连接恢复后可继续选择。</p>}
        {conflicted && <p className="intent-alignment-status">选项已更新，请重新确认。</p>}
      </div>
    </section>
  );
}
