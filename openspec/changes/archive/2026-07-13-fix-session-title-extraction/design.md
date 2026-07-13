## Context

`src/session/manager.ts` contains `extractSessionTitle()` which determines session titles for `/session list` display. The current implementation has two flaws: (1) `SLASH_COMMAND_RE = /^\/[a-zA-Z][a-zA-Z0-9_-]*\s*/` doesn't include `:` so commands like `/opsx:apply` are only partially stripped, and (2) it scans forward for the *first* qualifying message, so titles never reflect topic shifts.

## Goals / Non-Goals

**Goals:**
- Fix regex to fully strip colon-containing commands (`/opsx:apply`, `/opsx:propose`, etc.)
- Prefer the *last* qualifying non-command user message as title, so titles track topic evolution
- Filter out noise: single-word acknowledgments, thanks, greetings that aren't useful titles
- Require minimum 10 characters for any title candidate

**Non-Goals:**
- LLM-based title summarization (future option D)
- Changing title display format in `/session list` output
- Multi-turn semantic topic detection

## Decisions

### Decision 1: Regex fix — add `:` to character class

`/^\/[a-zA-Z][a-zA-Z0-9_-]*\s*/` → `/^\/[a-zA-Z][a-zA-Z0-9_:-]*\s*/`

Simple addition. The `:` is placed before `-` to avoid range ambiguity. This matches all current OpenSpec commands (`/opsx:apply`, `/opsx:propose`, `/opsx:explore`, `/opsx:archive`) plus standard slash commands. Also naturally covers `/skill` and similar patterns.

### Decision 2: Reverse scan instead of forward scan

Current `extractSessionTitle` does a forward `for` loop. Change to a reverse `for` loop (or `findLast`-style) that returns the *last* qualifying message. This naturally follows topic evolution — the user's most recent substantive message is the best signal of current topic.

```
Before:  msg1(cmd) → msg2(prompt) → msg3(prompt) → title = msg2
After:   msg1(cmd) → msg2(prompt) → msg3(prompt) → title = msg3
```

### Decision 3: Noise filter — explicit deny-list

Use a simple set of regex/noise patterns to skip messages that aren't useful as titles:

```
NOISE_PATTERNS = [
  /^(thanks|thank you|thx|ok|okay|yes|no|hi|hello|hey|good|great|nice|cool)\b/i,
  /^[谢谢好的嗯哦啊哈嘿嗨]+$/,
  /^[.,!?;:]+$/,
]
```

Messages matching any noise pattern are skipped. Combined with the ≥10 char minimum, this covers virtually all non-title-worthy messages.

Alternative considered: pure length-based filter (≥10 chars). Rejected because "thanks a lot for your help!!!" is 28 chars but still noise. A deny-list catches these explicitly.

### Decision 4: Simplify `isTitleBetter`

With the noise filter in `extractSessionTitle`, `isTitleBetter` simplifies to:
- Replace if current title is placeholder ("New session") or empty
- Replace if candidate is meaningfully different from current and not obviously worse
- Don't replace if candidate is just a truncated version of current

## Risks / Trade-offs

- **Risk**: A user's last substantive message might be about a sub-topic, not the overall session theme. → Mitigation: this is acceptable for v1; the title still reflects *something* the user cares about right now. LLM summarization (option D) can address this later.
- **Risk**: The noise deny-list might not cover all languages/patterns. → Mitigation: start with English + Chinese common patterns; expand as needed. The ≥10 char gate already catches most noise.
