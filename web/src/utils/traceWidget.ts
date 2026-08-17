// ── Trace widget injection ──
// Builds a self-contained, script-and-style-carrying Trace tree widget and
// injects it into the Session Dashboard artifact HTML. The widget runs inside
// the dashboard iframe and renders a git-branch topology (one vertical lane per
// Agent, SubAgent forks to the right, merge back with a dashed elbow) with zero
// third-party dependencies. The tree is projected on the backend; the client
// only embeds and renders it.

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
    <span class="muted">Agent lanes · git branches</span>
    <button class="icon-btn" id="fullscreenBtn" title="Fullscreen" aria-label="Toggle fullscreen" style="margin-left:auto">⤢</button>
  </div>

  <div class="trace-toolbar">
    <div class="group">
      <label for="fromDate">From</label>
      <input type="date" id="fromDate" />
      <label for="toDate">To</label>
      <input type="date" id="toDate" />
      <button class="icon-btn" id="clearFilter" title="Clear date filter">✕</button>
    </div>
    <div class="group">
      <span class="toolbar-label">Agent</span>
      <select id="agentFilter" class="trace-select"></select>
    </div>
    <div class="group">
      <span class="toolbar-label">Density</span>
      <select id="densityFilter" class="trace-select">
        <option value="compact" selected>Compact</option>
        <option value="relaxed">Relaxed</option>
      </select>
    </div>
    <div class="group">
      <button class="icon-btn" id="zoomOut" title="Zoom out">−</button>
      <button class="icon-btn" id="zoomIn" title="Zoom in">+</button>
      <button class="icon-btn" id="fitView" title="Fit view">⛶</button>
    </div>
    <div class="legend">
      <span class="item"><span class="mk diamond"></span>Agent</span>
      <span class="item"><span class="mk circle"></span>User</span>
      <span class="item"><span class="mk dot"></span>Assistant</span>
      <span class="item"><span class="mk square"></span>Tool</span>
    </div>
  </div>

  <div class="trace-main">
    <div class="canvas-wrap" id="canvasWrap">
      <svg id="tree"></svg>
      <div class="canvas-hint">scroll to zoom · drag to pan · click node for details · caret to collapse</div>
    </div>
    <aside class="trace-detail empty" id="detail">
      <div class="trace-detail-empty">
        <div class="trace-detail-empty-glyph">⎇</div>
        <div>Select a node to inspect</div>
        <div class="trace-detail-empty-sub">Agent · message · tool call</div>
      </div>
    </aside>
  </div>

  <style>
    .trace-widget {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      padding: 8px 10px;
      font-family: system-ui, -apple-system, sans-serif;
      color: var(--text);
    }
    .trace-widget * { box-sizing: border-box; }
    .trace-widget .trace-head {
      display: flex; align-items: center; gap: 8px;
      padding: 0 0 6px; font-size: 12px; color: var(--muted);
    }
    .trace-widget .trace-head .glyph { color: var(--accent); font-weight: 700; }
    .trace-widget .trace-head-title { color: var(--text); font-weight: 600; }
    .trace-widget .muted { color: var(--muted); }
    .trace-widget .icon-btn {
      border: 1px solid var(--border); background: var(--surface);
      color: var(--text); width: 28px; height: 28px; border-radius: 6px;
      cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      font-size: 13px;
    }
    .trace-widget .trace-toolbar {
      display: none; align-items: center; gap: 10px; flex-wrap: wrap;
      padding: 8px 0; border-bottom: 1px solid var(--border);
    }
    .trace-widget .trace-toolbar .group { display: flex; align-items: center; gap: 6px; }
    .trace-widget .trace-toolbar label, .trace-widget .toolbar-label {
      font-size: 12px; color: var(--muted);
    }
    .trace-widget input[type="date"], .trace-widget .trace-select {
      font-family: inherit; font-size: 12px; color: var(--text);
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 6px; padding: 4px 6px;
    }
    .trace-widget .legend { display: flex; gap: 12px; align-items: center; margin-left: auto; }
    .trace-widget .legend .item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted); }
    .trace-widget .mk { width: 9px; height: 9px; display: inline-block; flex: 0 0 auto; }
    .trace-widget .mk.diamond { background: var(--accent); transform: rotate(45deg); border-radius: 1px; }
    .trace-widget .mk.circle { border: 1.5px solid var(--text); border-radius: 50%; }
    .trace-widget .mk.dot { background: var(--text); border-radius: 50%; }
    .trace-widget .mk.square { background: color-mix(in srgb, var(--accent) 30%, transparent); border: 1px solid var(--accent); }
    .trace-widget .trace-main { display: flex; min-height: 0; }
    .trace-widget .canvas-wrap {
      flex: 1 1 auto; position: relative; overflow: hidden; height: 200px;
      background: radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0);
      background-size: 22px 22px; cursor: grab;
    }
    .trace-widget .canvas-wrap:active { cursor: grabbing; }
    .trace-widget .canvas-wrap svg { width: 100%; height: 100%; display: block; }
    .trace-widget .canvas-hint {
      position: absolute; left: 14px; bottom: 12px; font-size: 11px;
      color: var(--muted); pointer-events: none;
    }
    .trace-widget .trace-detail {
      display: none; flex: 0 0 340px; border-left: 1px solid var(--border);
      background: var(--surface); overflow-y: auto; flex-direction: column;
    }
    .trace-widget .trace-detail.empty { align-items: center; justify-content: center; color: var(--muted); }
    .trace-widget .trace-detail-empty { text-align: center; padding: 24px; }
    .trace-widget .trace-detail-empty-glyph { font-size: 28px; opacity: 0.4; }
    .trace-widget .trace-detail-empty-sub { margin-top: 4px; font-size: 11px; color: var(--muted); }
    .trace-widget .trace-detail .pad { padding: 16px; }
    .trace-widget .trace-detail .kind-tag {
      display: inline-flex; align-items: center; gap: 6px; font-size: 11px;
      color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent);
      border-radius: 999px; padding: 3px 10px; font-weight: 600;
    }
    .trace-widget .trace-detail h2 { font-size: 15px; margin: 12px 0 4px; font-weight: 600; color: var(--text); }
    .trace-widget .trace-detail .sub { font-size: 12px; color: var(--muted); margin-bottom: 14px; }
    .trace-widget .trace-detail .row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .trace-widget .trace-detail .row .k {
      font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em;
    }
    .trace-widget .trace-detail .row .v {
      font-size: 13px; line-height: 1.5; background: var(--bg);
      border: 1px solid var(--border); border-radius: 8px;
      padding: 9px 10px; white-space: pre-wrap; word-break: break-word; color: var(--text);
    }
    .trace-widget .trace-detail .row .v.code { font-family: ui-monospace, monospace; font-size: 12px; }
    .trace-widget .trace-detail details.fold summary {
      cursor: pointer; font-size: 13px; line-height: 1.5; color: var(--text);
      background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 9px 10px;
      white-space: pre-wrap; word-break: break-word;
    }
    .trace-widget .trace-detail details.fold .v { margin-top: 4px; }
    .trace-widget .state-badge {
      display: inline-flex; align-items: center; gap: 5px; font-size: 11px;
      border-radius: 999px; padding: 2px 9px; font-weight: 600;
    }
    .trace-widget .state-running { background: var(--warning-bg, var(--warning)); color: var(--warning); }
    .trace-widget .state-completed { background: var(--success-bg, var(--success)); color: var(--success); }
    .trace-widget .state-failed { background: var(--error-bg, var(--error)); color: var(--error); }
    .trace-widget .state-terminated, .trace-widget .state-killed { background: var(--error-bg, var(--error)); color: var(--error); }
    .trace-widget .state-waiting, .trace-widget .state-created, .trace-widget .state-stopped { background: var(--surface); color: var(--muted); }
    .trace-widget.fullscreen {
      position: fixed; inset: 0; z-index: 100; background: var(--bg);
      overflow: auto; display: flex; flex-direction: column; padding: 12px 14px;
    }
    .trace-widget.fullscreen .trace-main { flex: 1 1 auto; height: auto; }
    .trace-widget.fullscreen .trace-toolbar { display: flex; }
    .trace-widget.fullscreen .trace-detail { display: flex; }
    .trace-widget.fullscreen .canvas-wrap { height: auto; min-height: 320px; }
  </style>

  <script>
(function () {
  "use strict";
  var BASE_ROOT = __TRACE_ROOT_JSON__;
  var NS = "http://www.w3.org/2000/svg";

  var LANE_COLORS = [
    "#b87503", "#2f8f83", "#3d6fb4", "#7a5fb0",
    "#b45f8f", "#4f8f4f", "#b08a2f", "#8f5f2f"
  ];
  var STATE_COLOR = {
    running: "var(--warning)", completed: "var(--success)", failed: "var(--error)",
    terminated: "var(--error)", killed: "var(--error)"
  };
  var KIND_ICON = { agent: "◇", user: "◯", assistant: "◆", tool: "▣", system: "ℹ" };

  var svg = document.getElementById("tree");
  var wrap = document.getElementById("canvasWrap");
  var detail = document.getElementById("detail");

  var collapsed = new Set();
  var selection = null;
  var view = { x: 40, y: 40, k: 1 };
  var selectedAgent = "";

  var DENSITY = { compact: { lane: 132, row: 28, nodeH: 22, fs: 10 }, relaxed: { lane: 168, row: 40, nodeH: 28, fs: 11 } };
  var density = "compact";
  var LANE_W = DENSITY.compact.lane;
  var ROW_H = DENSITY.compact.row;
  var NODE_H = DENSITY.compact.nodeH;
  var NODE_W = 128;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function agentList(root) {
    var list = [{ id: "main", label: root.label || "Main" }];
    var seen = new Set(["main"]);
    (function walk(n) {
      if (n.kind === "agent" && !seen.has(n.ownerAgentId)) {
        seen.add(n.ownerAgentId);
        list.push({ id: n.ownerAgentId, label: n.label });
      }
      n.children.forEach(walk);
    })(root);
    return list;
  }

  function renderAgentFilter() {
    var el = document.getElementById("agentFilter");
    var agents = agentList(BASE_ROOT);
    el.innerHTML = "";
    agents.forEach(function (a) {
      var opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.label;
      el.appendChild(opt);
    });
    el.value = selectedAgent;
  }

  function applyFilters(root, from, to, owner) {
    var min = from ? new Date(from + "T00:00:00").getTime() : -Infinity;
    var max = to ? new Date(to + "T23:59:59.999").getTime() : Infinity;
    function inRange(n) {
      if (n.kind === "agent") return true;
      if (n.ts == null) return true;
      return n.ts >= min && n.ts <= max;
    }
    function ownerOk(n) {
      if (n.id === root.id) return true;
      if (!owner) return true;
      return n.ownerAgentId === owner;
    }
    function matches(n) { return inRange(n) && ownerOk(n); }
    function hasMatch(n) { return matches(n) || n.children.some(hasMatch); }
    function clone(n) {
      return {
        id: n.id, kind: n.kind, label: n.label, sub: n.sub, ts: n.ts,
        ownerAgentId: n.ownerAgentId, lane: n.lane, mergeTargetId: n.mergeTargetId,
        ghost: n.ghost === true || !matches(n),
        isError: n.isError, state: n.state, detail: n.detail, unattached: n.unattached,
        children: n.children.filter(hasMatch).map(clone)
      };
    }
    return clone(root);
  }

  // Depth-first layout: each node gets a row; x = lane * LANE_W.
  function measure(root) {
    var pos = new Map();
    var order = [];
    var maxLane = 0;
    (function visit(n, row) {
      pos.set(n.id, { x: n.lane * LANE_W, y: row * ROW_H, lane: n.lane });
      order.push(n);
      maxLane = Math.max(maxLane, n.lane);
      var next = row + 1;
      if (collapsed.has(n.id) || n.children.length === 0) return next;
      // Continuation children (non-agent) first so the spine stays straight;
      // agent forks render to the right.
      var cont = n.children.filter(function (c) { return c.kind !== "agent"; });
      var forks = n.children.filter(function (c) { return c.kind === "agent"; });
      var all = cont.concat(forks);
      var r = next;
      for (var i = 0; i < all.length; i++) r = visit(all[i], r);
      return r;
    })(root, 0);
    return { pos: pos, order: order, maxLane: maxLane };
  }

  function focusSubtree(root, selectedId) {
    if (!selectedId) return null;
    var set = new Set();
    var found = false;
    (function walk(n, inSub) {
      if (inSub || n.id === selectedId) {
        found = true; set.add(n.id); n.children.forEach(function (c) { walk(c, true); });
      } else {
        n.children.forEach(function (c) { walk(c, false); });
      }
    })(root, false);
    return found ? set : null;
  }

  function laneColor(lane) {
    return LANE_COLORS[lane % LANE_COLORS.length];
  }

  function shapeFor(kind, ghost, x, y) {
    var cx = x + 12, cy = y + NODE_H / 2;
    if (kind === "agent") {
      var d = "M " + cx + " " + (cy - 7) + " L " + (cx + 7) + " " + cy + " L " + cx + " " + (cy + 7) + " L " + (cx - 7) + " " + cy + " Z";
      return '<path d="' + d + '" fill="' + (ghost ? "transparent" : "var(--accent)") + '" stroke="var(--accent)" stroke-width="1.5"/>';
    }
    if (kind === "user") {
      return '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="transparent" stroke="' + (ghost ? "var(--border)" : "var(--text)") + '" stroke-width="1.5"/>';
    }
    if (kind === "assistant") {
      return '<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="' + (ghost ? "var(--border)" : "var(--text)") + '"/>';
    }
    if (kind === "tool") {
      return '<rect x="' + (cx - 5) + '" y="' + (cy - 5) + '" width="10" height="10" fill="' + (ghost ? "transparent" : "color-mix(in srgb, var(--accent) 30%, transparent)") + '" stroke="var(--accent)" stroke-width="1.25"/>';
    }
    return '<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="var(--muted)"/>';
  }

  function render() {
    var from = document.getElementById("fromDate").value;
    var to = document.getElementById("toDate").value;
    var tree = applyFilters(BASE_ROOT, from, to, selectedAgent);
    var m = measure(tree);
    var pos = m.pos, order = m.order, maxLane = m.maxLane;
    var focusSet = focusSubtree(tree, selection);

    svg.innerHTML = "";

    var g = document.createElementNS(NS, "g");
    g.setAttribute("transform", "translate(" + view.x + "," + view.y + ") scale(" + view.k + ")");
    svg.appendChild(g);

    // Lane vertical guides
    for (var lane = 0; lane <= maxLane; lane++) {
      var line = document.createElementNS(NS, "line");
      var lx = lane * LANE_W + 12;
      line.setAttribute("x1", lx); line.setAttribute("y1", -40);
      line.setAttribute("x2", lx); line.setAttribute("y2", order.length * ROW_H + 40);
      line.setAttribute("stroke", laneColor(lane));
      line.setAttribute("stroke-width", 1);
      line.setAttribute("opacity", "0.18");
      g.appendChild(line);
    }

    var byId = new Map();
    order.forEach(function (n) { byId.set(n.id, n); });

    // Edges: parent -> child (elbow), plus dashed merge edges.
    function drawEdge(fromId, toId, dashed) {
      var a = pos.get(fromId), b = pos.get(toId);
      if (!a || !b) return;
      var y1 = a.y + NODE_H / 2, y2 = b.y + NODE_H / 2;
      var x1 = a.x + 12, x2 = b.x + 12;
      var midY = (y1 + y2) / 2;
      var path = document.createElementNS(NS, "path");
      path.setAttribute("d", "M " + x1 + " " + y1 + " L " + x1 + " " + midY + " L " + x2 + " " + midY + " L " + x2 + " " + y2);
      path.setAttribute("fill", "none");
      var child = byId.get(toId);
      var ghost = child && child.ghost;
      path.setAttribute("stroke", ghost ? "var(--border)" : "var(--muted)");
      path.setAttribute("stroke-width", 1.25);
      if (dashed) path.setAttribute("stroke-dasharray", "3 3");
      if (focusSet && !focusSet.has(toId)) path.setAttribute("opacity", "0.18");
      g.appendChild(path);
    }

    order.forEach(function (n) {
      if (collapsed.has(n.id)) return;
      n.children.forEach(function (c) { drawEdge(n.id, c.id, false); });
    });

    // Merge edges (SubAgent tail -> parent continuation), dashed.
    order.forEach(function (n) {
      if (n.mergeTargetId && byId.has(n.mergeTargetId)) {
        var a = pos.get(n.id), b = pos.get(n.mergeTargetId);
        if (!a || !b) return;
        var y = Math.max(a.y, b.y) + NODE_H;
        var x1 = a.x + 12, x2 = b.x + 12;
        var path = document.createElementNS(NS, "path");
        path.setAttribute("d", "M " + x1 + " " + y + " L " + x2 + " " + y);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "var(--muted)");
        path.setAttribute("stroke-width", 1);
        path.setAttribute("stroke-dasharray", "3 3");
        if (focusSet && !focusSet.has(n.id)) path.setAttribute("opacity", "0.18");
        g.appendChild(path);
      }
    });

    // Nodes
    order.forEach(function (n) {
      var p = pos.get(n.id);
      if (!p) return;
      var x = p.x, y = p.y;
      var grp = document.createElementNS(NS, "g");
      grp.setAttribute("transform", "translate(" + x + "," + y + ")");
      grp.setAttribute("data-id", n.id);
      grp.style.cursor = n.ghost ? "default" : "pointer";
      if (focusSet && !focusSet.has(n.id)) grp.setAttribute("opacity", "0.22");

      var rect = document.createElementNS(NS, "rect");
      rect.setAttribute("width", NODE_W);
      rect.setAttribute("height", NODE_H);
      rect.setAttribute("rx", 6); rect.setAttribute("ry", 6);
      rect.setAttribute("fill", n.ghost ? "transparent" : (n.kind === "agent" ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--surface)"));
      rect.setAttribute("stroke", n.ghost ? "var(--border)" : (n.kind === "agent" ? "var(--accent)" : "var(--border)"));
      rect.setAttribute("stroke-width", n.ghost ? 1 : (selection === n.id ? 2 : 1));
      rect.setAttribute("stroke-dasharray", n.ghost ? "3 3" : "none");
      grp.appendChild(rect);

      grp.innerHTML += shapeFor(n.kind, n.ghost, 0, 0);

      var label = document.createElementNS(NS, "text");
      label.setAttribute("x", 26); label.setAttribute("y", NODE_H / 2 + 1);
      label.setAttribute("dominant-baseline", "middle");
      label.setAttribute("font-size", DENSITY[density].fs);
      label.setAttribute("font-weight", n.kind === "agent" ? 700 : 600);
      label.setAttribute("fill", n.ghost ? "var(--muted)" : "var(--text)");
      label.setAttribute("font-family", "ui-monospace, monospace");
      label.textContent = n.ghost ? n.label : n.label;
      grp.appendChild(label);

      if (n.state && !n.ghost) {
        var s = document.createElementNS(NS, "circle");
        s.setAttribute("cx", NODE_W - 12); s.setAttribute("cy", 8); s.setAttribute("r", 3.5);
        s.setAttribute("fill", STATE_COLOR[n.state] || "var(--muted)");
        grp.appendChild(s);
      }
      if (n.isError && !n.ghost) {
        var err = document.createElementNS(NS, "circle");
        err.setAttribute("cx", NODE_W - 12); err.setAttribute("cy", 8); err.setAttribute("r", 3.5);
        err.setAttribute("fill", "var(--error)");
        grp.appendChild(err);
      }

      if (n.children.length > 0 && !n.ghost) {
        var caret = document.createElementNS(NS, "g");
        caret.setAttribute("transform", "translate(" + (NODE_W - 24) + "," + (NODE_H / 2) + ")");
        caret.setAttribute("data-caret", "true");
        caret.style.cursor = "pointer";
        var tri = document.createElementNS(NS, "path");
        var collapsedNow = collapsed.has(n.id);
        tri.setAttribute("d", collapsedNow ? "M -3 -4 L 4 0 L -3 4 Z" : "M -4 -3 L 4 -3 L 0 4 Z");
        tri.setAttribute("fill", "var(--muted)");
        caret.appendChild(tri);
        grp.appendChild(caret);
      }

      if (collapsed.has(n.id)) {
        var count = countDescendants(n);
        var badge = document.createElementNS(NS, "text");
        badge.setAttribute("x", NODE_W - 8); badge.setAttribute("y", NODE_H / 2 + 1);
        badge.setAttribute("text-anchor", "end");
        badge.setAttribute("dominant-baseline", "middle");
        badge.setAttribute("font-size", DENSITY[density].fs);
        badge.setAttribute("fill", "var(--accent)");
        badge.textContent = "+" + count;
        grp.appendChild(badge);
      }

      grp.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (n.ghost) return;
        var target = ev.target;
        if (target && target.closest && target.closest("[data-caret]")) {
          toggleCollapse(n.id);
          return;
        }
        selection = n.id;
        renderDetail(n);
        render();
      });

      g.appendChild(grp);
    });

    var minX = 0, minY = 0;
    var maxX = maxLane * LANE_W + NODE_W + 20;
    var maxY = order.length * ROW_H + 20;
    wrap.dataset.bounds = JSON.stringify({ minX: minX, minY: minY, maxX: maxX, maxY: maxY });
  }

  function countDescendants(n) {
    var c = 0;
    (function walk(x) { x.children.forEach(function (k) { c++; walk(k); }); })(n);
    return c;
  }

  function toggleCollapse(id) {
    if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
    render();
  }

  function longValue(v) { return v != null && String(v).length > 600; }

  function valueCell(v, code) {
    var cls = "v" + (code ? " code" : "");
    if (longValue(v)) {
      return '<details class="fold"><summary>' + esc(String(v).slice(0, 400)) + ' …</summary><div class="' + cls + '">' + esc(v) + '</div></details>';
    }
    return '<div class="' + cls + '">' + esc(v) + '</div>';
  }

  function renderDetail(n) {
    detail.classList.remove("empty");
    var d = n.detail || {};
    var state = n.state;
    var stateBadge = state ? '<span class="state-badge state-' + esc(state) + '">' + esc(state) + '</span>' : "";
    var body = "";
    body += '<div class="kind-tag">' + (KIND_ICON[n.kind] || "") + ' ' + esc(n.kind) + (n.isError ? ' · error' : '') + '</div>';
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

    detail.innerHTML = '<div class="pad">' + body + '</div>';
  }

  function fitView() {
    var b = JSON.parse(wrap.dataset.bounds || '{"minX":0,"minY":0,"maxX":600,"maxY":300}');
    var w = wrap.clientWidth, h = wrap.clientHeight;
    var bw = Math.max(b.maxX - b.minX, 1), bh = Math.max(b.maxY - b.minY, 1);
    var k = Math.min(w / bw, h / bh) * 0.92;
    view = { k: k, x: (w - bw * k) / 2 - b.minX * k, y: (h - bh * k) / 2 - b.minY * k };
    render();
  }

  var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  wrap.addEventListener("wheel", function (e) {
    e.preventDefault();
    var rect = wrap.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var factor = Math.pow(1.0015, -e.deltaY);
    var k2 = Math.min(2.2, Math.max(0.2, view.k * factor));
    view.x = mx - ((mx - view.x) / view.k) * k2;
    view.y = my - ((my - view.y) / view.k) * k2;
    view.k = k2;
    render();
  }, { passive: false });

  wrap.addEventListener("pointerdown", function (e) {
    if (e.target && e.target.closest && e.target.closest("[data-caret]")) return;
    var tag = e.target && e.target.tagName;
    if (tag === "text" || tag === "rect" || tag === "circle" || tag === "path" || tag === "g") return;
    dragging = true; sx = e.clientX; sy = e.clientY; ox = view.x; oy = view.y;
    if (wrap.setPointerCapture) wrap.setPointerCapture(e.pointerId);
  });
  wrap.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    view.x = ox + (e.clientX - sx);
    view.y = oy + (e.clientY - sy);
    render();
  });
  wrap.addEventListener("pointerup", function () { dragging = false; });

  document.getElementById("zoomIn").addEventListener("click", function () {
    var rect = wrap.getBoundingClientRect();
    var mx = rect.width / 2, my = rect.height / 2;
    var k2 = Math.min(2.2, view.k * 1.25);
    view.x = mx - ((mx - view.x) / view.k) * k2;
    view.y = my - ((my - view.y) / view.k) * k2;
    view.k = k2; render();
  });
  document.getElementById("zoomOut").addEventListener("click", function () {
    var rect = wrap.getBoundingClientRect();
    var mx = rect.width / 2, my = rect.height / 2;
    var k2 = Math.max(0.2, view.k / 1.25);
    view.x = mx - ((mx - view.x) / view.k) * k2;
    view.y = my - ((my - view.y) / view.k) * k2;
    view.k = k2; render();
  });
  document.getElementById("fitView").addEventListener("click", fitView);
  document.getElementById("clearFilter").addEventListener("click", function () {
    document.getElementById("fromDate").value = "";
    document.getElementById("toDate").value = "";
    render();
  });
  document.getElementById("fromDate").addEventListener("change", render);
  document.getElementById("toDate").addEventListener("change", render);
  document.getElementById("agentFilter").addEventListener("change", function (e) {
    selectedAgent = e.target.value;
    render();
  });
  document.getElementById("densityFilter").addEventListener("change", function (e) {
    density = e.target.value;
    LANE_W = DENSITY[density].lane;
    ROW_H = DENSITY[density].row;
    NODE_H = DENSITY[density].nodeH;
    render();
  });
  document.getElementById("fullscreenBtn").addEventListener("click", function () {
    var widget = document.getElementById("traceWidget");
    widget.classList.toggle("fullscreen");
    document.getElementById("fullscreenBtn").textContent =
      widget.classList.contains("fullscreen") ? "⤡" : "⤢";
    requestAnimationFrame(fitView);
  });

  renderAgentFilter();
  render();
  requestAnimationFrame(fitView);
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
