---
name: html-output
description: Produce rich, self-contained, single-file HTML as the default output format instead of Markdown — for specs, plans, code reviews, PR write-ups, reports, explainers, design explorations, slide decks, SVG diagrams, and small interactive editors with copy-as-prompt/JSON export. USE WHEN the user asks to "make an HTML file/artifact", or wants a richer, more readable, shareable deliverable (anything you'd otherwise write as a long Markdown doc: plans, reviews, reports, explainers, mockups, dashboards, editors). DO NOT USE WHEN the user explicitly wants Markdown/plain text, a Feishu/Lark doc, or a real multi-file production web app with a build step.
---

# Writing HTML outputs

Markdown is portable but cramped: nobody reads a 100-line `.md`, it can't render
color/diagrams/interaction, and it's awkward to share. HTML fixes all three. Prefer
HTML whenever you'd otherwise hand back a long Markdown document.

This skill encodes the patterns from Anthropic's `html-effectiveness` gallery so the
HTML you generate is consistent, readable, and immediately shareable.

## When to reach for HTML

| Use case | Why HTML wins |
|---|---|
| Specs, plans, exploration | Side-by-side option grids, mockups, data-flow diagrams, annotated code |
| Code review / PR write-up | Rendered diffs, inline margin annotations, severity color-coding |
| Code / concept explainers | SVG flowcharts + annotated snippets + a "gotchas" section |
| Reports, research, status | Tables, charts, callouts; one link to share, renders everywhere |
| Design & prototypes | CSS/SVG is expressive; add sliders/knobs to tune, then export params |
| Custom editing UIs | Drag/drop, forms, live preview — end with a copy-as-X export button |

Rule of thumb: **if the answer is information-dense or longer than a screen, make it HTML.**

## Core principles (non-negotiable)

1. **Single self-contained file.** One `.html`, no build step, no external runtime
   dependencies. Inline all CSS in a `<style>` tag and all JS in a `<script>` tag.
   It must open correctly from `file://` by double-clicking.
2. **Information density over token thrift.** Use tables, SVG, CSS, and layout to
   pack in meaning. Don't fall back to ASCII diagrams or unicode-color hacks.
3. **Built to be read, then shared.** Visual hierarchy, scannable sections, mobile
   responsive. Assume a colleague opens it cold.
4. **Close the loop on interactive files.** Any editor/tuner MUST end with an export:
   a "Copy as JSON / Markdown / prompt / diff" button so the user's edits flow back
   into Claude or a file.
5. **No placeholder lorem.** Use the real ingested context (code, git history, docs).
   If data is genuinely unknown, label it clearly as a sample.

## Workflow

1. **Clarify the artifact's job, not just its topic.** What will the user *do* with it
   — read once, compare options, review a diff, edit and export? That decides the layout.
2. **Ingest real context first** (files, git log, MCP data, web) before writing markup.
3. **Pick a layout pattern** from `references/patterns.md` and the matching starter in
   `templates/`.
4. **Apply the design system** from `references/design-system.md` (copy the `:root`
   token block verbatim — do not invent a new palette per file).
5. **Write the file** with the Write tool (never via shell heredoc/echo — avoids escaping bugs).
6. **For interactive files**, wire up the export button using the clipboard helper in
   `references/design-system.md` (it has a `file://` fallback).
7. **Save & share.** Write to the working directory, then upload so the user gets a
   shareable link. Tell them the filename and what's inside.

## Layout patterns (quick reference)

- **Document** — eyebrow + serif H1 + summary strip of key/value cells + numbered sections. For plans, reports, explainers.
- **Option grid** — N columns, one card per approach, each labeled with the tradeoff it makes. For exploration / design comparison.
- **Annotated diff** — two-column or unified diff with margin annotations and severity-colored findings. For code review / PR.
- **SVG diagram** — hand-authored `<svg>` for flowcharts, token-bucket flows, architecture. Pair with annotated snippets.
- **Slide deck** — full-viewport sections with keyboard nav (←/→). For decks.
- **Editor** — interactive controls (drag cards, forms, sliders) + live preview + mandatory copy-as-X export.

Full structural notes and pitfalls are in `references/patterns.md`.

## Design system

Copy the token block from `references/design-system.md` into every file's `:root`.
It defines the Anthropic-style palette (ivory background, slate ink, clay accent,
oat/olive supporting) and three font stacks (serif headings, sans body, mono labels).
Consistency across files is what makes a "web of HTML files" feel like one product.

## Templates

- `templates/base.html` — minimal document skeleton (tokens + header + sections). Start here.
- `templates/editor.html` — interactive skeleton with a working copy-as-prompt export.

## Anti-patterns

- ❌ External CSS/JS/CDN links, frameworks, or a build step → breaks `file://` and sharing.
- ❌ ASCII art or unicode blocks to fake diagrams/color → use SVG/CSS.
- ❌ A new color palette per file → use the shared tokens.
- ❌ An interactive file with no export button → the user can't get their work back out.
- ❌ Writing the file via `echo`/heredoc → use the Write tool.
- ❌ Reaching for HTML when the user asked for Markdown, a Feishu doc, or a prod web app.
