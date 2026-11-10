/*
 * charts.js - small hand-drawn SVG/HTML charts (no libraries, works offline).
 * Every chart gets hover/focus tooltips (data-tip, see App.tooltip) and a
 * table view in a <details> so no value is gated behind color or hover.
 */
(function () {
  "use strict";
  var App = window.App, h = App.h;
  var SVGNS = "http://www.w3.org/2000/svg";

  function s(tag, attrs, children) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs || {}) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    (children || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }
  function stext(attrs, str) { var t = s("text", attrs); t.textContent = str; return t; }

  function niceMax(v) {
    if (v <= 0) return 4;
    var pow = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * pow >= v) return steps[i] * pow;
    return 10 * pow;
  }
  function tickFmt(v) { return v >= 10000 ? Math.round(v / 1000) + "K" : App.fmt(Math.round(v * 100) / 100); }

  /** Column with a 4px rounded data-end, square at the baseline. */
  function colPath(x, y, w, hgt) {
    if (hgt <= 0) return "";
    var r = Math.min(4, w / 2, hgt);
    return "M" + x + "," + (y + hgt) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y +
      "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + hgt) + "Z";
  }
  /** Horizontal bar, rounded at the right end. */
  function barPath(x, y, w, hgt) {
    if (w <= 0) return "";
    var r = Math.min(4, hgt / 2, w);
    return "M" + x + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) +
      "V" + (y + hgt - r) + "Q" + (x + w) + "," + (y + hgt) + " " + (x + w - r) + "," + (y + hgt) + "H" + x + "Z";
  }

  function legend(series, shape) {
    return h("ul", { class: "legend" }, series.map(function (sr) {
      return h("li", null, [h("span", { class: "key key-" + (shape || "rect"), style: "background:" + sr.color }), sr.name]);
    }));
  }

  /** Table view in a disclosure. headers: [..], rows: [[..]] */
  function tableView(caption, headers, rows) {
    var table = h("table", { class: "data-table" }, [
      h("caption", { class: "sr-only", text: caption }),
      h("thead", null, h("tr", null, headers.map(function (x, i) { return h("th", { scope: "col", class: i ? "num" : null, text: x }); }))),
      h("tbody", null, rows.map(function (r) {
        return h("tr", null, r.map(function (c, i) {
          return i ? h("td", { class: "num", text: String(c) }) : h("th", { scope: "row", text: String(c) });
        }));
      }))
    ]);
    return h("details", { class: "table-view" }, [h("summary", { text: "Show the numbers (" + App.plural(rows.length, "row") + ")" }), h("div", { class: "table-scroll" }, table)]);
  }

  /** Re-render on width change so text stays at real pixel size. */
  function responsive(host, draw) {
    var last = 0;
    function run() {
      var w = Math.round(host.clientWidth);
      if (!w || w === last) return;
      last = w;
      draw(w);
    }
    if (window.ResizeObserver) new ResizeObserver(run).observe(host);
    else window.addEventListener("resize", run);
    run();
  }

  /**
   * Grouped column chart.
   * cfg: { labels:[], tipLabels:[], series:[{name, values, color}], height, yTitle, markIndex }
   */
  function columns(host, cfg) {
    App.tooltip();
    host.classList.add("chart", "pre");
    var plot = h("div", { class: "chart-plot" });
    host.textContent = "";
    if (cfg.series.length > 1) host.appendChild(legend(cfg.series));
    host.appendChild(plot);

    responsive(plot, function (W) {
      plot.textContent = "";
      var H = cfg.height || 260, m = { t: 14, r: 8, b: 30, l: 40 };
      var pw = W - m.l - m.r, ph = H - m.t - m.b;
      var n = cfg.labels.length;
      var max = 0;
      cfg.series.forEach(function (sr) { sr.values.forEach(function (v) { if (v > max) max = v; }); });
      var top = niceMax(max), ticks = 4;
      var y = function (v) { return m.t + ph - (v / top) * ph; };
      var svg = s("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": cfg.ariaLabel || "" });

      for (var t = 0; t <= ticks; t++) {
        var v = (top / ticks) * t, yy = Math.round(y(v)) + 0.5;
        svg.appendChild(s("line", { x1: m.l, x2: W - m.r, y1: yy, y2: yy, class: t ? "grid" : "axis" }));
        svg.appendChild(stext({ x: m.l - 6, y: yy + 4, "text-anchor": "end", class: "tick" }, tickFmt(v)));
      }

      var band = pw / Math.max(n, 1);
      var ns = cfg.series.length;
      var gap = 2;
      var bw = Math.max(1, Math.min(24, (band * 0.78 - gap * (ns - 1)) / ns));
      var groupW = bw * ns + gap * (ns - 1);
      var every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 58))));

      for (var i = 0; i < n; i++) {
        var gx = m.l + band * i + (band - groupW) / 2;
        var g = s("g", { class: "col-group" + (cfg.markIndex === i ? " marked" : ""), tabindex: "0", style: "--i:" + Math.min(i, 40) });
        var tipRows = [[cfg.tipLabels ? cfg.tipLabels[i] : cfg.labels[i]]];
        cfg.series.forEach(function (sr, k) {
          var val = sr.values[i] || 0;
          var p = colPath(gx + k * (bw + gap), y(val), bw, y(0) - y(val));
          if (p) g.appendChild(s("path", { d: p, style: "fill:" + sr.color }));
          tipRows.push([sr.name, App.fmt(val), sr.color]);
        });
        g.appendChild(s("rect", { x: m.l + band * i, y: m.t, width: band, height: ph, class: "hit" }));
        g.setAttribute("data-tip", JSON.stringify(tipRows));
        g.setAttribute("aria-label", tipRows[0][0] + ": " + tipRows.slice(1).map(function (r) { return r[0] + " " + r[1]; }).join(", "));
        svg.appendChild(g);
        if (i % every === 0 || (n <= 12)) {
          svg.appendChild(stext({ x: m.l + band * i + band / 2, y: H - 10, "text-anchor": "middle", class: "tick" }, cfg.labels[i]));
        }
      }
      plot.appendChild(svg);
      App.observe(host);
    });
  }

  /**
   * Horizontal bar list with optional employer logos.
   * items: [{label, value, source?, employer?, highlight?}], cfg: {color, valueFmt, logos}
   */
  function hbars(host, items, cfg) {
    App.tooltip();
    cfg = cfg || {};
    host.classList.add("chart", "pre");
    host.textContent = "";
    var max = 0;
    items.forEach(function (it) { if (it.value > max) max = it.value; });
    var list = h("ol", { class: "hbars" + (cfg.logos ? " with-logos" : "") });
    items.forEach(function (it, i) {
      var frac = max ? it.value / max : 0;
      var svg = s("svg", { class: "hbar-svg", viewBox: "0 0 100 12", preserveAspectRatio: "none", "aria-hidden": "true" }, [
        s("rect", { x: 0, y: 0, width: 100, height: 12, class: "track" }),
        s("path", { d: barPath(0, 0, Math.max(frac * 100, it.value ? 0.8 : 0), 12), style: "fill:" + (it.color || cfg.color || "var(--series-1)") })
      ]);
      var valText = cfg.valueFmt ? cfg.valueFmt(it.value) : App.fmt(it.value);
      var li = h("li", {
        class: "hbar" + (it.highlight ? " is-highlight" : ""), tabindex: "0", style: "--i:" + Math.min(i, 20),
        "data-tip": JSON.stringify([[it.label], [cfg.seriesName || "Open postings", valText, it.color || cfg.color || "var(--series-1)"]].concat(it.extraTip || []))
      }, [
        h("span", { class: "hbar-rank", text: String(i + 1) }),
        cfg.logos ? App.logo(it.source, it.employer || it.label, "sm") : null,
        h("span", { class: "hbar-label", title: it.label }, [it.label].concat(it.badges || [])),
        h("span", { class: "hbar-track" }, svg),
        h("span", { class: "hbar-value", text: valText })
      ]);
      list.appendChild(li);
    });
    host.appendChild(list);
    App.observe(host);
  }

  /** Tall segmented bar: one whole split into parts. parts: [{label, value, color, ink}] */
  function segmentedBar(host, parts, cfg) {
    App.tooltip();
    cfg = cfg || {};
    host.classList.add("chart", "pre");
    host.textContent = "";
    var total = parts.reduce(function (a, p) { return a + p.value; }, 0);
    host.appendChild(legend(parts.map(function (p) { return { name: p.label, color: p.color }; })));
    var bar = h("div", { class: "segbar", role: "img", "aria-label": parts.map(function (p) {
      return p.label + ": " + App.fmt(p.value) + " (" + App.pct(total ? p.value / total : 0) + ")";
    }).join("; ") });
    parts.forEach(function (p) {
      if (!p.value) return;
      var share = p.value / total;
      bar.appendChild(h("div", {
        class: "segbar-part", tabindex: "0",
        style: "flex-grow:" + p.value + ";background:" + p.color + ";color:" + (p.ink || "#fff"),
        "data-tip": JSON.stringify([[p.label], ["Postings", App.fmt(p.value), p.color], ["Share", App.pct(share), null]])
      }, share >= 0.09 ? h("span", { text: App.pct(share, 0) }) : null));
    });
    host.appendChild(bar);
    App.observe(host);
    if (cfg.caption) host.appendChild(h("p", { class: "chart-caption", text: cfg.caption }));
  }

  window.Charts = { columns: columns, hbars: hbars, segmentedBar: segmentedBar, tableView: tableView, legend: legend };
})();
