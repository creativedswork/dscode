// ── Trace widget injection ──
// Builds a self-contained, script-and-style-carrying Trace tree widget and
// injects it into the Session Dashboard artifact HTML. The widget runs inside
// the dashboard iframe and renders a trajectory tree (node + parent→child thin
// edges) with zero third-party dependencies. The tree is projected on the
// backend; the client only embeds and renders it.
//
// The view is a readable fixed-node-size layout (vertical + horizontal scroll)
// with no minimap, zoom, fullscreen or linear-run folding. Nodes are typed by
// shape (agent=diamond, user=open circle, assistant=dot, tool=square) and
// clicking highlights the selected node plus its ancestor/descendant path
// without dimming any other node.

import { applyArtifactTheme } from "./artifactTheme.js";
import type { ArtifactTheme } from "../../../src/application/artifact-theme.js";
import type { TraceTree } from "@dscode/shared/trace-tree";

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function stripScriptTags(html: string): string {
  return html.replace(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
    "",
  );
}

function stripHtmlFences(html: string): string {
  let result = html.trim();
  result = result.replace(/^```(?:html|HTML)?\s*\n?/, "");
  result = result.replace(/\n?```\s*$/, "");
  return result;
}

const WIDGET_TEMPLATE = `<!-- dscode trace widget -->
<div class="trace-widget" id="traceWidget">
  <div class="trace-head">
    <span class="glyph">⎇</span>
    <span class="trace-head-title">Trace · trajectory</span>
    <span class="muted">轨迹树 · Agent 分叉</span>
  </div>

  <div class="trace-toolbar">
    <button class="icon-btn" id="themeBtn" title="Toggle theme" aria-label="Toggle theme">◐</button>
    <button class="icon-btn" id="clearBtn" title="Clear selection" aria-label="Clear selection" disabled>✕ 清除选择</button>
    <span class="hint"><kbd>Esc</kbd> / 点空白清除选择</span>
  </div>

  <div class="trace-main">
    <div class="graph-scroll" id="graphScroll">
      <div class="graph" id="graph">
        <svg class="tree" id="tree"></svg>
        <div class="rows" id="rows"></div>
      </div>
    </div>
    <aside class="trace-detail" id="detail">
      <div class="trace-detail-head"><span>节点详情</span><button class="icon-btn" id="detailX" title="Clear selection" aria-label="Clear selection">✕</button></div>
      <div class="trace-detail-body" id="detailBody">
        <div class="trace-detail-empty">
          <div class="trace-detail-empty-glyph">⎇</div>
          <div>选择一个节点查看详情</div>
          <div class="trace-detail-empty-sub">点击节点 · Esc / 点空白清除</div>
        </div>
      </div>
    </aside>
  </div>

  <style>
    .trace-widget {
      --bg: #f8f7f5;
      --surface: #f3f2ef;
      --border: #e6e4e0;
      --text: #2d2a26;
      --muted: #8a8580;
      --accent: #b87503;
      --success: #347539;
      --error: #9f2f2d;
      --warning: #8a6500;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      padding: 10px 12px;
      font-family: system-ui, -apple-system, sans-serif;
      color: var(--text);
      font-size: 13px;
    }
    .trace-widget.dark {
      --bg: #1e1c19;
      --surface: #282622;
      --border: #3a3732;
      --text: #e8e4dd;
      --muted: #8a8580;
      --accent: #c98605;
      --success: #5ca860;
      --error: #e05553;
      --warning: #d5a72a;
    }
    .trace-widget * { box-sizing: border-box; }
    .trace-widget .trace-head {
      display: flex; align-items: center; gap: 8px;
      padding: 0 0 8px; font-size: 13px;
    }
    .trace-widget .trace-head .glyph { color: var(--accent); font-weight: 700; }
    .trace-widget .trace-head-title { font-weight: 600; }
    .trace-widget .muted { color: var(--muted); }
    .trace-widget .trace-toolbar {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 7px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
    }
    .trace-widget .icon-btn {
      border: 1px solid var(--border); background: var(--bg);
      color: var(--text); height: 26px; border-radius: 6px;
      cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      font-size: 12px; padding: 0 8px;
    }
    .trace-widget .icon-btn:hover { background: color-mix(in srgb, var(--accent) 8%, transparent); }
    .trace-widget .icon-btn:disabled { opacity: 0.4; cursor: default; }
    .trace-widget .hint { font-size: 11px; color: var(--muted); margin-left: auto; }
    .trace-widget .hint kbd {
      font-family: ui-monospace, monospace; background: var(--bg);
      border: 1px solid var(--border); border-radius: 4px; padding: 0 5px; font-size: 10px;
    }
    .trace-widget .trace-main { display: flex; min-height: 0; border-top: 1px solid var(--border); margin-top: 8px; }

    /* ── left: trajectory tree (SVG edges + node markers) over commit rows ── */
    .trace-widget .graph-scroll { flex: 1 1 auto; overflow: auto; min-width: 0; position: relative; height: 360px; }
    .trace-widget .graph { position: relative; min-width: 640px; }
    .trace-widget svg.tree { position: absolute; left: 0; top: 0; z-index: 0; pointer-events: none; }
    .trace-widget .rows { position: relative; z-index: 1; }

    .trace-widget .row { display: flex; height: 34px; cursor: pointer; user-select: none; }
    .trace-widget .row:hover { background: color-mix(in srgb, var(--accent) 5%, transparent); }
    .trace-widget .gutter { flex: 0 0 auto; }
    .trace-widget .commit {
      flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 10px;
      border-bottom: 1px solid var(--border); padding-right: 12px;
    }
    .trace-widget .row:last-child .commit { border-bottom: none; }

    .trace-widget .commit .who { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .trace-widget .commit .label { font-weight: 600; white-space: nowrap; }
    .trace-widget .commit .label.tool { font-family: ui-monospace, monospace; font-weight: 600; }
    .trace-widget .chip {
      flex: 0 0 auto; font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 999px;
      white-space: nowrap; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent);
    }
    .trace-widget .commit .msg { flex: 1 1 auto; min-width: 0; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .trace-widget .commit .ts { flex: 0 0 auto; font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted); }
    .trace-widget .commit .state { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; }
    .trace-widget .state.done { background: var(--success); }
    .trace-widget .state.running { background: var(--warning); }
    .trace-widget .state.failed { background: var(--error); }
    .trace-widget .state.waiting { background: transparent; border: 1.5px solid var(--muted); }

    /* selection & path highlight — no opacity dimming anywhere */
    .trace-widget .row.selected { background: color-mix(in srgb, var(--accent) 12%, transparent); }
    .trace-widget .row.selected .commit { box-shadow: inset 3px 0 0 var(--accent); }
    .trace-widget .row.selected .label { color: var(--accent); }
    .trace-widget .row.path .commit { background: color-mix(in srgb, var(--accent) 5%, transparent); }

    /* ── right: detail panel ── */
    .trace-widget .trace-detail {
      flex: 0 0 260px; border-left: 1px solid var(--border);
      background: var(--surface); display: flex; flex-direction: column; min-height: 0;
    }
    .trace-widget .trace-detail-head {
      padding: 7px 10px; font-size: 11px; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .trace-widget .trace-detail-body { flex: 1; overflow: auto; padding: 14px; }
    .trace-widget .trace-detail-empty {
      height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
      color: var(--muted); text-align: center; gap: 6px;
    }
    .trace-widget .trace-detail-empty-glyph { font-size: 26px; opacity: 0.35; }
    .trace-widget .trace-detail-empty-sub { font-size: 11px; color: var(--muted); }
    .trace-widget .trace-detail .kind-tag {
      display: inline-flex; align-items: center; gap: 6px; font-size: 11px;
      color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent);
      border-radius: 999px; padding: 3px 10px; font-weight: 600;
    }
    .trace-widget .trace-detail h2 { font-size: 15px; margin: 12px 0 4px; font-weight: 600; color: var(--text); }
    .trace-widget .trace-detail .sub { font-size: 12px; color: var(--muted); margin-bottom: 14px; }
    .trace-widget .trace-detail .row { display: block; cursor: default; height: auto; margin-bottom: 12px; }
    .trace-widget .trace-detail .row:hover { background: transparent; }
    .trace-widget .trace-detail .k {
      font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;
    }
    .trace-widget .trace-detail .v {
      font-size: 12px; line-height: 1.5; background: var(--bg);
      border: 1px solid var(--border); border-radius: 6px; padding: 8px 9px;
      white-space: pre-wrap; word-break: break-word; color: var(--text);
    }
    .trace-widget .trace-detail .v.code { font-family: ui-monospace, monospace; font-size: 11px; }
    .trace-widget .trace-detail details.fold summary {
      cursor: pointer; font-size: 12px; line-height: 1.5; color: var(--text);
      background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px 9px;
      white-space: pre-wrap; word-break: break-word;
    }
    .trace-widget .trace-detail details.fold .v { margin-top: 4px; }
    .trace-widget .state-badge {
      display: inline-flex; align-items: center; gap: 5px; font-size: 11px;
      border-radius: 999px; padding: 2px 9px; font-weight: 600;
    }
    .trace-widget .state-running { background: color-mix(in srgb, var(--warning) 16%, transparent); color: var(--warning); }
    .trace-widget .state-completed { background: color-mix(in srgb, var(--success) 16%, transparent); color: var(--success); }
    .trace-widget .state-failed { background: color-mix(in srgb, var(--error) 16%, transparent); color: var(--error); }
    .trace-widget .state-terminated, .trace-widget .state-killed { background: color-mix(in srgb, var(--error) 16%, transparent); color: var(--error); }
    .trace-widget .state-waiting, .trace-widget .state-created, .trace-widget .state-stopped { background: var(--bg); color: var(--muted); }
  </style>

  <script>
(function () {
  "use strict";
  var BASE_ROOT = __TRACE_ROOT_JSON__;

  var LANE_COLORS = [
    "#b87503", "#2f8f83", "#3d6fb4", "#7a5fb0",
    "#b45f8f", "#4f8f4f", "#b08a2f", "#8f5f2f"
  ];
  var KIND_ICON = { agent: "◇", user: "◯", assistant: "◆", tool: "▣", system: "ℹ" };

  var ROW_H = 34;
  var LANE_BASE = 20;
  var LANE_SPACING = 36;

  var widget = document.getElementById("traceWidget");
  var treeEl = document.getElementById("tree");
  var rowsEl = document.getElementById("rows");
  var graph = document.getElementById("graph");
  var graphScroll = document.getElementById("graphScroll");
  var detailBody = document.getElementById("detailBody");
  var clearBtn = document.getElementById("clearBtn");

  var selection = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function laneColor(lane) {
    return LANE_COLORS[((lane % LANE_COLORS.length) + LANE_COLORS.length) % LANE_COLORS.length];
  }

  function laneX(lane) { return LANE_BASE + lane * LANE_SPACING; }

  // Flatten the tree into a fork-first row order (a SubAgent subtree sits right
  // after its spawn point, before the parent path continues). Also derive the
  // pure-visual "return" edges: each SubAgent tail returns to its parent path's
  // continuation node.
  function flatten(root) {
    var rows = [];
    var parentOf = {};
    var rowIdx = {};
    var subtreeEnd = {};
    var returns = [];
    var maxLane = 0;

    (function visit(n, parent) {
      var start = rows.length;
      rows.push(n);
      rowIdx[n.id] = start;
      if (parent) parentOf[n.id] = parent.id;
      if (n.lane > maxLane) maxLane = n.lane;

      var forks = n.children.filter(function (c) { return c.kind === "agent"; });
      var cont = n.children.filter(function (c) { return c.kind !== "agent"; });

      forks.forEach(function (f) { visit(f, n); });

      forks.forEach(function (f) {
        var target = cont[0];
        if (target) {
          returns.push({ from: rows[subtreeEnd[f.id]].id, to: target.id });
        }
      });

      cont.forEach(function (c) { visit(c, n); });

      subtreeEnd[n.id] = rows.length - 1;
    })(root, null);

    return { rows: rows, parentOf: parentOf, rowIdx: rowIdx, returns: returns, maxLane: maxLane };
  }

  function shapeFor(n, x, y, isRoot) {
    var halo = '<circle cx="' + x + '" cy="' + y + '" r="12" fill="var(--surface)"/>';
    var m;
    var c = laneColor(n.lane);
    if (n.kind === "agent") {
      m = '<path d="M ' + x + ' ' + (y - 8) + ' L ' + (x + 8) + ' ' + y + ' L ' + x + ' ' + (y + 8) + ' L ' + (x - 8) + ' ' + y + ' Z" fill="' + c + '" stroke="' + c + '" stroke-width="1.5"/>';
      if (isRoot) {
        m += '<circle cx="' + x + '" cy="' + y + '" r="13" fill="none" stroke="' + c + '" stroke-width="1.5" opacity="0.55"/>';
      }
    } else if (n.kind === "user") {
      m = '<circle cx="' + x + '" cy="' + y + '" r="6" fill="none" stroke="var(--text)" stroke-width="1.5"/>';
    } else if (n.kind === "assistant") {
      m = '<circle cx="' + x + '" cy="' + y + '" r="5" fill="var(--text)"/>';
    } else if (n.kind === "tool") {
      m = '<rect x="' + (x - 6) + '" y="' + (y - 6) + '" width="12" height="12" rx="2" fill="none" stroke="var(--accent)" stroke-width="1.5"/>';
    } else {
      m = '<circle cx="' + x + '" cy="' + y + '" r="4" fill="var(--text)"/>';
    }
    return halo + m;
  }

  function edgePath(a, b) {
    var x1 = laneX(a.lane), y1 = a._row * ROW_H + ROW_H / 2 + 10;
    var x2 = laneX(b.lane), y2 = b._row * ROW_H + ROW_H / 2 - 10;
    if (x1 === x2) {
      return "M " + x1 + " " + y1 + " L " + x2 + " " + y2;
    }
    var mid = (y1 + y2) / 2;
    return "M " + x1 + " " + y1 + " C " + x1 + " " + mid + " " + x2 + " " + mid + " " + x2 + " " + y2;
  }

  function ancestors(id, out) {
    var cur = id;
    while (cur) {
      out.add(cur);
      cur = F.parentOf[cur];
    }
  }

  function descendants(id, out) {
    var n = byId[id];
    if (!n) return;
    n.children.forEach(function (c) {
      out.add(c.id);
      descendants(c.id, out);
    });
  }

  function pathSet() {
    if (!selection) return null;
    var out = new Set([selection]);
    ancestors(selection, out);
    descendants(selection, out);
    return out;
  }

  function stateClass(n) {
    if (n.isError) return "failed";
    var s = n.state;
    if (s === "completed" || s === "done") return "done";
    if (s === "running") return "running";
    if (s === "failed" || s === "terminated" || s === "killed") return "failed";
    return "waiting";
  }

  function timeStr(ts) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  function chipHtml(n) {
    if (n.kind !== "agent") return "";
    return '<span class="chip">' + esc(n.label) + '</span>';
  }

  var F = null;
  var byId = {};

  function renderRows() {
    rowsEl.innerHTML = "";
    var path = pathSet();
    var gutterW = laneX(F.maxLane) + 32;
    F.rows.forEach(function (n, i) {
      var row = document.createElement("div");
      row.className = "row";
      if (selection === n.id) row.classList.add("selected");
      else if (path && path.has(n.id)) row.classList.add("path");

      var gutter = document.createElement("div");
      gutter.className = "gutter";
      gutter.style.flexBasis = gutterW + "px";

      var commit = document.createElement("div");
      commit.className = "commit";
      var st = stateClass(n);
      commit.innerHTML =
        '<div class="who">' +
          '<span class="label' + (n.kind === "tool" ? " tool" : "") + '">' + esc(n.label) + '</span>' +
          chipHtml(n) +
        '</div>' +
        '<span class="msg">' + esc(n.sub || "") + '</span>' +
        '<span class="ts">' + esc(n.ts != null ? timeStr(n.ts) : "") + '</span>' +
        '<span class="state ' + st + '"></span>';

      row.appendChild(gutter);
      row.appendChild(commit);
      row.addEventListener("click", function (ev) {
        ev.stopPropagation();
        selection = (selection === n.id) ? null : n.id;
        render();
      });
      rowsEl.appendChild(row);
    });
  }

  function renderDetail() {
    if (!selection) {
      detailBody.innerHTML =
        '<div class="trace-detail-empty"><div class="trace-detail-empty-glyph">⎇</div>' +
        '<div>选择一个节点查看详情</div>' +
        '<div class="trace-detail-empty-sub">点击节点 · Esc / 点空白清除</div></div>';
      return;
    }
    var n = byId[selection];
    if (!n) return;
    var d = n.detail || {};
    var stateBadge = n.state ? '<span class="state-badge state-' + esc(n.state) + '">' + esc(n.state) + '</span>' : "";
    var body = '<div class="kind-tag">' + (KIND_ICON[n.kind] || "") + ' ' + esc(n.kind) + (n.isError ? ' · error' : '') + '</div>';
    body += '<h2>' + esc(d.title || n.label || n.kind) + '</h2>';
    body += '<div class="sub">' + esc(n.sub || "") + ' ' + stateBadge + '</div>';

    var rows = [];
    if (n.kind === "agent") {
      if (d.role) rows.push(["Role", d.role, false]);
      if (d.application) rows.push(["Application", d.application, false]);
      if (d.state) rows.push(["State", d.state, false]);
      if (d.input) rows.push(["Input", d.input, false]);
      if (d.output) rows.push(["Output", d.output, false]);
      if (d.error) rows.push(["Error", d.error, false]);
    } else if (n.kind === "assistant" || n.kind === "user" || n.kind === "system") {
      if (d.content) rows.push(["Content", d.content, false]);
      if (d.thinking) rows.push(["Thinking", d.thinking, false]);
    } else if (n.kind === "tool") {
      rows.push(["Tool", d.toolName || d.title, false]);
      if (d.args) rows.push(["Arguments", d.args, true]);
      if (d.result) rows.push(["Result", d.result, true]);
      if (d.resultText) rows.push(["Result detail", d.resultText, true]);
    }
    if (n.ts != null) rows.push(["Timestamp", new Date(n.ts).toLocaleString(), false]);

    rows.forEach(function (r) {
      body += '<div class="row"><div class="k">' + esc(r[0]) + '</div>' + valueCell(r[1], r[2]) + '</div>';
    });

    detailBody.innerHTML = body;
  }

  function longValue(v) { return v != null && String(v).length > 600; }

  function valueCell(v, code) {
    var cls = "v" + (code ? " code" : "");
    if (longValue(v)) {
      return '<details class="fold"><summary>' + esc(String(v).slice(0, 400)) + ' …</summary><div class="' + cls + '">' + esc(v) + '</div></details>';
    }
    return '<div class="' + cls + '">' + esc(v) + '</div>';
  }

  function render() {
    F = flatten(BASE_ROOT);
    byId = {};
    F.rows.forEach(function (n) { byId[n.id] = n; });

    var gutterW = laneX(F.maxLane) + 32;
    var H = F.rows.length * ROW_H;
    graph.style.minWidth = (gutterW + 420) + "px";

    treeEl.setAttribute("width", gutterW);
    treeEl.setAttribute("height", H);
    var s = "";

    // tree edges (parent -> child, child lane color) + return edges (muted).
    F.rows.forEach(function (n) {
      n._row = F.rowIdx[n.id];
      if (F.parentOf[n.id]) {
        var a = byId[F.parentOf[n.id]];
        var b = n;
        var col = laneColor(b.lane);
        s += '<path d="' + edgePath(a, b) + '" fill="none" stroke="' + col + '" stroke-width="1.5" opacity="0.55"/>';
      }
    });
    F.returns.forEach(function (r) {
      var a = byId[r.from], b = byId[r.to];
      if (!a || !b) return;
      s += '<path d="' + edgePath(a, b) + '" fill="none" stroke="var(--muted)" stroke-width="1.25" opacity="0.55"/>';
    });

    // node markers (typed shapes + halo), drawn on top of edges.
    F.rows.forEach(function (n, i) {
      var x = laneX(n.lane), y = i * ROW_H + ROW_H / 2;
      s += shapeFor(n, x, y, i === 0);
    });

    treeEl.innerHTML = s;
    renderRows();
    renderDetail();
    clearBtn.disabled = selection == null;
  }

  function clearSelection() {
    selection = null;
    render();
  }

  graphScroll.addEventListener("click", function (e) {
    if (e.target === graphScroll || e.target === graph) clearSelection();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") clearSelection();
  });

  document.getElementById("themeBtn").addEventListener("click", function () {
    var dark = widget.classList.toggle("dark");
    this.textContent = dark ? "◑" : "◐";
    render();
  });
  document.getElementById("clearBtn").addEventListener("click", clearSelection);
  document.getElementById("detailX").addEventListener("click", clearSelection);

  render();
})();
  </script>
</div>`;

function emptyStateWidget(): string {
  return `<!-- dscode trace widget -->
<div class="trace-widget" id="traceWidget" style="border:1px solid var(--border);border-radius:12px;background:var(--surface);padding:16px;color:var(--muted);font-family:system-ui,sans-serif;font-size:13px;">
  <span style="color:var(--accent);font-weight:700;">⎇ Trace · trajectory</span>
  <div style="margin-top:8px;">No trace data available for this session.</div>
</div>`;
}

export function buildTraceWidgetHtml(tree: TraceTree | null): string {
  if (!tree) return emptyStateWidget();
  return WIDGET_TEMPLATE.replace("__TRACE_ROOT_JSON__", safeJson(tree.root));
}

function injectTraceWidget(html: string, widget: string): string {
  const placeholder = /<div\b[^>]*\bid\s*=\s*["']trace-tree["'][^>]*>\s*<\/div>/i;
  if (placeholder.test(html)) {
    return html.replace(placeholder, widget);
  }
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${widget}\n</body>`);
  }
  return `${html}\n${widget}`;
}

export function prepareSessionDashboardHtml(
  html: string,
  theme: ArtifactTheme,
  tree: TraceTree | null,
): string {
  const cleaned = stripScriptTags(stripHtmlFences(html));
  const widget = buildTraceWidgetHtml(tree);
  const themed = applyArtifactTheme(cleaned, theme);
  return injectTraceWidget(themed, widget);
}
