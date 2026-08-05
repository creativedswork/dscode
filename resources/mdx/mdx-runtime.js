(function() {
  "use strict";

  // ── Utility ──
  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function fmtCurrency(v) {
    var a = Math.abs(v), s = v < 0 ? "-" : "";
    if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(1) + "K";
    return s + "$" + Math.round(a);
  }

  function fmtNumber(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return String(Math.round(v));
  }

  function getCssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  // ── Data Binding ──
  function resolveBindingPath(path, data) {
    var parts = path.split(".");
    var current = data;
    for (var i = 0; i < parts.length; i++) {
      if (current && typeof current === "object") {
        current = current[parts[i]];
      } else {
        return undefined;
      }
    }
    return current;
  }

  function setBindingPath(path, data, value) {
    var parts = path.split(".");
    var current = data;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== "object") {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }

  function resolveBindings(value, data) {
    if (value === null || value === undefined) return value;
    if (typeof value === "object" && value !== null && "binding" in value) {
      return resolveBindingPath(value.binding, data);
    }
    if (Array.isArray(value)) {
      return value.map(function(v) { return resolveBindings(v, data); });
    }
    if (typeof value === "object") {
      var resolved = {};
      var keys = Object.keys(value);
      for (var i = 0; i < keys.length; i++) {
        resolved[keys[i]] = resolveBindings(value[keys[i]], data);
      }
      return resolved;
    }
    return value;
  }

  // ── MDX Parser ──
  var ALL_COMPONENTS = ["Chart", "Metrics", "Table", "Slider", "Card", "Row"];

  function findMatchingClose(source, start, tag) {
    var openTag = "<" + tag;
    var closeTag = "</" + tag + ">";
    var depth = 1;
    var i = start;

    while (i < source.length) {
      var nextOpen = source.indexOf(openTag, i);
      var nextClose = source.indexOf(closeTag, i);
      if (nextClose === -1) return -1;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        var afterOpen = source[nextOpen + openTag.length];
        if (afterOpen === " " || afterOpen === ">" || afterOpen === "/") depth++;
        i = nextOpen + openTag.length;
      } else {
        depth--;
        if (depth === 0) return nextClose;
        i = nextClose + closeTag.length;
      }
    }
    return -1;
  }

  function parseAttributes(attrStr) {
    var props = {};
    if (!attrStr) return props;

    var i = 0;
    while (i < attrStr.length) {
      while (i < attrStr.length && /\s/.test(attrStr[i])) i++;
      if (i >= attrStr.length) break;

      var eqIdx = attrStr.indexOf("=", i);
      if (eqIdx === -1) break;

      var name = attrStr.slice(i, eqIdx).trim();
      i = eqIdx + 1;
      if (i >= attrStr.length) break;

      var ch = attrStr[i];
      if (ch === '"' || ch === "'") {
        var quote = ch;
        i++;
        var val = "";
        while (i < attrStr.length && attrStr[i] !== quote) {
          if (attrStr[i] === "\\" && i + 1 < attrStr.length) { i++; val += attrStr[i]; }
          else { val += attrStr[i]; }
          i++;
        }
        if (i < attrStr.length) i++;
        props[name] = val;
      } else if (ch === "{") {
        var braceCount = 1;
        i++;
        var val2 = "";
        while (i < attrStr.length && braceCount > 0) {
          if (attrStr[i] === "{") braceCount++;
          else if (attrStr[i] === "}") braceCount--;
          if (braceCount > 0) val2 += attrStr[i];
          i++;
        }
        var trimmed = val2.trim();
        if (trimmed.indexOf("[") === 0 && trimmed.lastIndexOf("]") === trimmed.length - 1) {
          try { props[name] = JSON.parse(trimmed); }
          catch(e) { props[name] = { binding: trimmed }; }
        } else if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
          props[name] = Number(trimmed);
        } else {
          props[name] = { binding: trimmed };
        }
      } else {
        var val3 = "";
        while (i < attrStr.length && attrStr[i] !== " " && attrStr[i] !== "/" && attrStr[i] !== ">") {
          val3 += attrStr[i]; i++;
        }
        if (val3 === "true") props[name] = true;
        else if (val3 === "false") props[name] = false;
        else if (/^-?\d+(\.\d+)?$/.test(val3)) props[name] = Number(val3);
        else props[name] = val3;
      }
    }
    return props;
  }

  function parseMDX(source, knownComponents) {
    var known = knownComponents || ALL_COMPONENTS;
    var elements = [];
    var i = 0;

    while (i < source.length) {
      if (source[i] === "<") {
        var closeIdx = source.indexOf(">", i);
        if (closeIdx === -1) { i++; continue; }
        if (source[i + 1] === "/") { i = closeIdx + 1; continue; }

        var tagBlock = source.slice(i, closeIdx + 1);
        var selfClosing = tagBlock.slice(-2) === "/>";
        var tagMatch = tagBlock.match(/^<(\w+)/);
        if (!tagMatch) { i++; continue; }

        var tag = tagMatch[1];
        if (known.indexOf(tag) === -1) {
          elements.push({ tag: "unknown", props: { componentName: tag }, children: [], textContent: "" });
          i = closeIdx + 1;
          continue;
        }

        var content = tagBlock.slice(tag.length + 1, selfClosing ? -2 : -1).trim();
        var props = parseAttributes(content);

        if (selfClosing) {
          elements.push({ tag: tag, props: props, children: [], textContent: "" });
          i = closeIdx + 1;
        } else {
          var closingIdx = findMatchingClose(source, closeIdx + 1, tag);
          if (closingIdx === -1) {
            elements.push({ tag: tag, props: props, children: [], textContent: "" });
            i = closeIdx + 1;
          } else {
            var inner = source.slice(closeIdx + 1, closingIdx);
            var children = parseMDX(inner, known);
            elements.push({ tag: tag, props: props, children: children, textContent: inner.trim() });
            i = closingIdx + ("</" + tag + ">").length;
          }
        }
      } else if (source[i] === "\n" || source[i] === " " || source[i] === "\t" || source[i] === "\r") {
        i++;
      } else {
        var nextTag = source.indexOf("<", i);
        if (nextTag === -1) break;
        var text = source.slice(i, nextTag).trim();
        if (text) {
          elements.push({ tag: "text", props: { content: text }, children: [], textContent: text });
        }
        i = nextTag;
      }
    }
    return elements;
  }

  // ── Components ──
  var BUILTIN_COMPONENTS = {};

  BUILTIN_COMPONENTS.Chart = {
    render: function(element, data, container, notifyChange) {
      var props = resolveBindings(element.props, data);
      var chartType = props.type || "line";
      var chartData = props.data;
      var xField = props.x;
      var yFields = props.y;

      var wrapper = el("div", "mdx-chart-wrap");

      if (!chartData || !Array.isArray(chartData) || chartData.length === 0 || !xField) {
        wrapper.textContent = "[Chart: no data]";
        return wrapper;
      }

      var yFieldList = Array.isArray(yFields) ? yFields
        : typeof yFields === "string" ? [yFields]
        : Object.keys(chartData[0]).filter(function(k) { return typeof chartData[0][k] === "number" && k !== xField; });

      var canvas = document.createElement("canvas");
      canvas.className = "mdx-chart";
      wrapper.appendChild(canvas);

      var legend = el("div", "mdx-chart-legend");
      for (var fi = 0; fi < yFieldList.length; fi++) {
        var item = el("span", "mdx-legend-item");
        var dot = el("span", "mdx-legend-dot");
        item.appendChild(dot);
        item.appendChild(document.createTextNode(yFieldList[fi]));
        legend.appendChild(item);
      }
      wrapper.appendChild(legend);

      // Defer canvas render to next frame so dimensions are available
      requestAnimationFrame(function() {
        renderChart(canvas, chartType, chartData, xField, yFieldList);
      });

      var ro = new ResizeObserver(function() {
        renderChart(canvas, chartType, chartData, xField, yFieldList);
      });
      ro.observe(canvas);

      return wrapper;
    }
  };

  function renderChart(canvas, chartType, chartData, xField, yFieldList) {
    var rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    var w = rect.width;
    var h = rect.height;
    var pad = { top: 10, right: 16, bottom: 28, left: 52 };
    var pw = w - pad.left - pad.right;
    var ph = h - pad.top - pad.bottom;

    var xVals = [];
    for (var i = 0; i < chartData.length; i++) xVals.push(chartData[i][xField]);

    var allY = [];
    for (var fi = 0; fi < yFieldList.length; fi++) {
      for (var j = 0; j < chartData.length; j++) {
        var v = chartData[j][yFieldList[fi]];
        if (typeof v === "number") allY.push(v);
      }
    }
    var yMin = 0;
    var yMax = Math.max.apply(null, allY.concat([1]));
    var yRange = yMax - yMin || 1;

    function toX(idx) { return pad.left + (idx / Math.max(chartData.length - 1, 1)) * pw; }
    function toY(val) { return pad.top + ph - ((val - yMin) / yRange) * ph; }

    var colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
    var bg = getCssVar("--bg", "#ffffff");
    var textColor = getCssVar("--text", "#171717");
    var border = getCssVar("--border", "#e5e7eb");
    var muted = getCssVar("--muted", "#6b7280");

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = border;
    ctx.lineWidth = 0.5;
    for (var j = 0; j <= 4; j++) {
      var y = pad.top + (j / 4) * ph;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    }

    // Y labels
    ctx.fillStyle = muted;
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";
    for (var j2 = 0; j2 <= 4; j2++) {
      var v2 = yMin + ((4 - j2) / 4) * yRange;
      ctx.fillText(fmtCurrency(v2), pad.left - 4, pad.top + (j2 / 4) * ph + 4);
    }

    // X labels
    ctx.textAlign = "center";
    var maxXLabels = Math.min(chartData.length, 6);
    var xStep = Math.max(1, Math.floor(chartData.length / maxXLabels));
    for (var i2 = 0; i2 < chartData.length; i2 += xStep) {
      ctx.fillText(String(xVals[i2]), toX(i2), h - pad.bottom + 14);
    }

    // Data lines
    for (var fi2 = 0; fi2 < yFieldList.length; fi2++) {
      var yf = yFieldList[fi2];
      ctx.strokeStyle = colors[fi2 % colors.length];
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var i3 = 0; i3 < chartData.length; i3++) {
        var v3 = chartData[i3][yf];
        var x = toX(i3);
        var y2 = toY(typeof v3 === "number" ? v3 : 0);
        if (i3 === 0) ctx.moveTo(x, y2); else ctx.lineTo(x, y2);
      }
      ctx.stroke();

      ctx.fillStyle = colors[fi2 % colors.length];
      for (var i4 = 0; i4 < chartData.length; i4++) {
        var v4 = chartData[i4][yf];
        var x2 = toX(i4);
        var y3 = toY(typeof v4 === "number" ? v4 : 0);
        ctx.beginPath(); ctx.arc(x2, y3, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  BUILTIN_COMPONENTS.Metrics = {
    render: function(element, data, container, notifyChange) {
      var props = resolveBindings(element.props, data);
      var items = props.items;
      var wrapper = el("div", "mdx-metrics");

      if (!items || typeof items !== "object") {
        wrapper.textContent = "[Metrics: no data]";
        return wrapper;
      }

      var grid = el("div", "mdx-metrics-grid");
      var keys = Object.keys(items);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = items[key];
        var card = el("div", "mdx-metric-card");
        var valEl = el("div", "mdx-metric-value");
        valEl.textContent = typeof value === "number" ? fmtCurrency(value) : String(value);
        var labelEl = el("div", "mdx-metric-label");
        labelEl.textContent = key.replace(/([A-Z])/g, " $1").replace(/^./, function(s) { return s.toUpperCase(); });
        card.appendChild(valEl);
        card.appendChild(labelEl);
        grid.appendChild(card);
      }
      wrapper.appendChild(grid);
      return wrapper;
    }
  };

  BUILTIN_COMPONENTS.Table = {
    render: function(element, data, container, notifyChange) {
      var props = resolveBindings(element.props, data);
      var rows = props.rows;
      var wrapper = el("div", "mdx-table-wrap");

      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        wrapper.textContent = "[Table: no data]";
        return wrapper;
      }

      var columns = Object.keys(rows[0]);
      var table = document.createElement("table");
      table.className = "mdx-table";

      var thead = document.createElement("thead");
      var headerRow = document.createElement("tr");
      for (var ci = 0; ci < columns.length; ci++) {
        var th = document.createElement("th");
        th.textContent = columns[ci].replace(/([A-Z])/g, " $1").replace(/^./, function(s) { return s.toUpperCase(); });
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);

      var tbody = document.createElement("tbody");
      for (var ri = 0; ri < rows.length; ri++) {
        var row = rows[ri];
        var tr = document.createElement("tr");
        for (var cj = 0; cj < columns.length; cj++) {
          var td = document.createElement("td");
          var v = row[columns[cj]];
          td.textContent = typeof v === "number" ? fmtNumber(v) : String(v != null ? v : "");
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);

      wrapper.appendChild(table);
      return wrapper;
    }
  };

  BUILTIN_COMPONENTS.Slider = {
    render: function(element, data, container, notifyChange) {
      var props = resolveBindings(element.props, data);
      var param = props.param;
      var min = props.min != null ? props.min : 0;
      var max = props.max != null ? props.max : 100;
      var step = props.step != null ? props.step : 1;
      var format = props.format || "number";
      var bindPath = props.bind;

      var wrapper = el("div", "mdx-slider-row");

      if (!param) { wrapper.textContent = "[Slider: no param]"; return wrapper; }

      var label = el("span", "mdx-slider-label");
      label.textContent = param.replace(/([A-Z])/g, " $1").replace(/^./, function(s) { return s.toUpperCase(); });

      var input = document.createElement("input");
      input.type = "range";
      input.className = "mdx-slider-input";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);

      var currentVal = bindPath ? resolveBindingPath(bindPath, data) : undefined;
      var initialVal = typeof currentVal === "number" ? currentVal : min;
      input.value = String(initialVal);

      var valueDisplay = el("span", "mdx-slider-value");
      valueDisplay.textContent = format === "currency" ? fmtCurrency(initialVal) : String(initialVal);

      input.addEventListener("input", function() {
        var v = Number(input.value);
        valueDisplay.textContent = format === "currency" ? fmtCurrency(v) : String(v);
        if (bindPath) setBindingPath(bindPath, data, v);
        if (notifyChange) notifyChange();
      });

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      wrapper.appendChild(valueDisplay);
      return wrapper;
    }
  };

  BUILTIN_COMPONENTS.Card = {
    render: function(element, data, container, notifyChange) {
      var props = resolveBindings(element.props, data);
      var title = props.title;
      var wrapper = el("div", "mdx-card");
      if (title) {
        var titleEl = el("div", "mdx-card-title", title);
        wrapper.appendChild(titleEl);
      }
      wrapper.setAttribute("data-mdx-card", "true");
      return wrapper;
    }
  };

  BUILTIN_COMPONENTS.Row = {
    render: function(element, data, container, notifyChange) {
      var wrapper = el("div", "mdx-row");
      wrapper.setAttribute("data-mdx-row", "true");
      return wrapper;
    }
  };

  // ── Renderer ──
  function renderMDX(mdx, data, container) {
    container.innerHTML = "";
    container.className = "mdx-root";

    try {
      var elements = parseMDX(mdx);
      renderElements(elements, data, container, mdx);
    } catch(err) {
      container.innerHTML = '<div class="mdx-error">Render error: ' + (err.message || String(err)) + '</div>';
    }
  }

  function renderElements(elements, data, parent, mdxSource) {
    for (var i = 0; i < elements.length; i++) {
      var rendered = renderElement(elements[i], data, mdxSource);
      if (rendered) parent.appendChild(rendered);
    }
  }

  function renderElement(element, data, mdxSource) {
    if (element.tag === "text") {
      var span = document.createElement("span");
      span.className = "mdx-text";
      span.textContent = element.props.content;
      return span;
    }

    if (element.tag === "unknown") {
      var div = document.createElement("div");
      div.className = "mdx-unknown";
      div.textContent = "[Unknown component: " + element.props.componentName + "]";
      return div;
    }

    var component = BUILTIN_COMPONENTS[element.tag];
    if (!component) {
      var div2 = document.createElement("div");
      div2.className = "mdx-unknown";
      div2.textContent = "[Unknown component: " + element.tag + "]";
      return div2;
    }

    var notifyChange = function() {
      var root = document.querySelector(".mdx-root");
      if (root && mdxSource) {
        renderMDX(mdxSource, data, root);
      }
    };

    var rendered = component.render(element, data, document.body, notifyChange);

    if (element.children.length > 0) {
      var childTarget = rendered.querySelector("[data-mdx-card]") || rendered.querySelector("[data-mdx-row]") || rendered;
      for (var ci = 0; ci < element.children.length; ci++) {
        var childEl = renderElement(element.children[ci], data, mdxSource);
        if (childEl) childTarget.appendChild(childEl);
      }
    }

    return rendered;
  }

  // ── Expose public API ──
  window.renderMDX = renderMDX;
  window.parseMDX = parseMDX;
  window.BUILTIN_COMPONENTS = BUILTIN_COMPONENTS;
})();
