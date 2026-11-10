/*
 * app.js - shared browser helpers: data loading, service worker registration,
 * DOM helpers, employer logos with monogram fallback, posting cards, the
 * shortlist, and the tooltip. Depends on core.js (window.JW).
 */
(function () {
  "use strict";
  var JW = window.JW;

  /* ------------------------------------------------------------ SW */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () { /* non-fatal */ });
    });
  }

  /* ------------------------------------------------------------ DOM */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "on") { for (var ev in v) el.addEventListener(ev, v[ev]); }
        else if (k === "style") el.setAttribute("style", v);
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null || c === false) return;
        el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
      });
    }
    return el;
  }

  var nf = new Intl.NumberFormat("en-US");
  function fmt(n) { return n == null ? "–" : nf.format(n); }
  function pct(x, digits) { return x == null ? "–" : (x * 100).toFixed(digits == null ? 1 : digits) + "%"; }
  function plural(n, one, many) { return fmt(n) + " " + (n === 1 ? one : (many || one + "s")); }

  function fmtDate(d) {
    if (!d) return "–";
    var dt = new Date(d + "T00:00:00Z");
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  function fmtShortDate(d) {
    var dt = new Date(d + "T00:00:00Z");
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  function fmtRunTime(iso) {
    var d = JW.parseUTC(iso);
    if (!d) return { utc: iso || "–", local: "", ago: "" };
    var utc = d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
    var local = d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    var ago = mins < 1 ? "just now" : mins < 60 ? mins + " min ago" :
      mins < 2880 ? Math.round(mins / 60) + " h ago" : Math.round(mins / 1440) + " days ago";
    return { utc: utc, local: local, ago: ago };
  }
  function oneLine(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }

  /* ------------------------------------------------------------ data */
  function fetchData(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error(path + ": HTTP " + res.status);
      return { res: res, cached: res.headers.get("X-JW-From-Cache") === "1" };
    });
  }

  /**
   * Load status.json and history.csv. Resolves to
   * { status, records, lastDate, fromCache, errors[] }.
   */
  function loadData() {
    var errors = [];
    var st = fetchData("data/status.json")
      .then(function (r) { return r.res.json().then(function (j) { return { data: j, cached: r.cached }; }); })
      .catch(function (e) { errors.push(e.message); return { data: null, cached: false }; });
    var hi = fetchData("data/history.csv")
      .then(function (r) { return r.res.text().then(function (t) { return { data: JW.parseHistory(t), cached: r.cached }; }); })
      .catch(function (e) { errors.push(e.message); return { data: [], cached: false }; });
    return Promise.all([st, hi]).then(function (v) {
      var status = v[0].data, records = v[1].data;
      var out = {
        status: status, records: records,
        lastDate: JW.lastRunDate(status, records),
        fromCache: v[0].cached || v[1].cached,
        errors: errors
      };
      if (out.fromCache || !navigator.onLine) showBanner("You're offline - showing the last data this device loaded.");
      if (errors.length && !records.length && !status) {
        showBanner("No data yet. The pipeline hasn't published data/status.json and data/history.csv (" + errors.join("; ") + ").", true);
      }
      return out;
    });
  }

  function showBanner(msg, warn) {
    var host = document.getElementById("banner");
    if (!host) return;
    host.hidden = false;
    host.className = "banner" + (warn ? " banner-warn" : "");
    host.textContent = msg;
  }

  /* ------------------------------------------------------------ logos */
  // Logos live at assets/logos/<source>.png. Until one loads (or if it 404s)
  // the employer's monogram shows instead. Failures are remembered so a
  // missing logo is requested at most once per page.
  var logoState = new Map(); // src -> "ok" | "fail"

  function initials(name) {
    var words = oneLine(name).replace(/[^A-Za-z0-9&' ]+/g, " ").split(" ").filter(function (w) {
      return w && !/^(inc|llc|llp|ltd|co|corp|the|and|of|&)$/i.test(w);
    });
    if (!words.length) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  function hashHue(s) {
    var x = 2166136261;
    s = String(s || "");
    for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
    return (x >>> 0) % 360;
  }

  function logoSlug(source) {
    return String(source || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  }

  /** Logo badge: monogram underneath, <img> fades in over it when it loads. size: "sm" | "md" | "lg". */
  function logo(source, employer, size) {
    var hue = hashHue(employer || source);
    var box = h("span", {
      class: "logo logo-" + (size || "md"),
      style: "--logo-h:" + hue,
      "aria-hidden": "true"
    }, h("span", { class: "logo-mono", text: initials(employer || source) }));
    if (!source) return box;
    var src = "assets/logos/" + logoSlug(source) + ".png";
    var state = logoState.get(src);
    if (state === "ok") { attachImg(box, src); return box; }
    if (state === "fail") return box;
    // One probe request per logo file; every badge waiting on it upgrades when it loads.
    var waiting = logoWaiting.get(src);
    if (!waiting) {
      waiting = [];
      logoWaiting.set(src, waiting);
      var probe = new Image();
      probe.onload = function () {
        logoState.set(src, "ok");
        logoWaiting.get(src).forEach(function (b) { if (b.isConnected) attachImg(b, src); });
        logoWaiting.delete(src);
      };
      probe.onerror = function () { logoState.set(src, "fail"); logoWaiting.delete(src); };
      probe.src = src;
    }
    waiting.push(box);
    return box;
  }
  var logoWaiting = new Map(); // src -> [badge elements waiting for the probe]

  function attachImg(box, src) {
    var img = h("img", { src: src, alt: "", loading: "lazy", decoding: "async", width: "64", height: "64" });
    img.addEventListener("load", function () { box.classList.add("has-img"); });
    img.addEventListener("error", function () { img.remove(); box.classList.remove("has-img"); });
    if (img.complete && img.naturalWidth) box.classList.add("has-img");
    box.appendChild(img);
  }

  /** employer -> source lookup built from history rows. */
  function employerSources(records) {
    var m = new Map();
    records.forEach(function (r) { if (r.employer && !m.has(r.employer)) m.set(r.employer, r.source); });
    return m;
  }

  /* ------------------------------------------------------------ shortlist */
  var SL_KEY = "jobwatcher.shortlist.v1";
  var Shortlist = {
    _set: null,
    load: function () {
      if (this._set) return this._set;
      var arr = [];
      try { arr = JSON.parse(localStorage.getItem(SL_KEY) || "[]"); } catch (e) { arr = []; }
      this._set = new Set(Array.isArray(arr) ? arr : []);
      return this._set;
    },
    has: function (id) { return this.load().has(id); },
    toggle: function (id) {
      var s = this.load();
      if (s.has(id)) s.delete(id); else s.add(id);
      try { localStorage.setItem(SL_KEY, JSON.stringify(Array.from(s))); } catch (e) { /* storage blocked */ }
      document.dispatchEvent(new CustomEvent("shortlist:change", { detail: { id: id, on: s.has(id) } }));
      return s.has(id);
    },
    size: function () { return this.load().size; }
  };
  window.addEventListener("storage", function (e) { if (e.key === SL_KEY) { Shortlist._set = null; } });

  function starButton(r) {
    var on = Shortlist.has(r.posting_id);
    var btn = h("button", {
      type: "button", class: "star" + (on ? " on" : ""),
      "aria-pressed": on ? "true" : "false",
      "aria-label": (on ? "Remove from" : "Add to") + " shortlist: " + oneLine(r.title)
    });
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';
    btn.addEventListener("click", function () {
      var now = Shortlist.toggle(r.posting_id);
      btn.classList.toggle("on", now);
      btn.setAttribute("aria-pressed", now ? "true" : "false");
      btn.setAttribute("aria-label", (now ? "Remove from" : "Add to") + " shortlist: " + oneLine(r.title));
    });
    return btn;
  }

  /* ------------------------------------------------------------ posting card */
  var CITY_LABEL = { NYC: "NYC", Nashville: "Nashville", Chicago: "Chicago" };

  function cityBadges(loc) {
    return JW.classifyCity(loc).map(function (c) {
      return h("span", { class: "badge badge-city city-" + c.toLowerCase(), title: "Target city: " + c }, [
        h("span", { class: "pin", "aria-hidden": "true" }), CITY_LABEL[c]
      ]);
    });
  }

  function splitLocations(loc) {
    var s = oneLine(loc);
    if (!s) return [];
    var parts = s.split(/\s*(?:;|\||\s\/\s|\n)\s*/).filter(Boolean);
    return parts.length > 3 ? parts.slice(0, 3).concat(["+" + (parts.length - 3) + " more"]) : parts;
  }

  /**
   * One posting rendered as a card <li>.
   * opts: { lastDate, star (bool), kind: "new"|"removed"|undefined }
   */
  function postingCard(r, opts) {
    opts = opts || {};
    var title = oneLine(r.title) || "(untitled posting)";
    var d = JW.daysOpen(r, opts.lastDate);
    var isNew = r.first_seen === opts.lastDate && !r.firstRun;
    var removed = r.status === "removed";

    var badges = [];
    if (isNew) badges.push(h("span", { class: "badge badge-new", text: "New" }));
    if (removed) badges.push(h("span", { class: "badge badge-removed", text: "Removed " + fmtShortDate(r.removed_date) }));
    if (r.inRole) badges.push(h("span", { class: "badge badge-role", text: "My role" }));
    badges = badges.concat(cityBadges(r.location));

    var locs = splitLocations(r.location).map(function (l) { return h("span", { class: "chip", text: l }); });
    if (!locs.length) locs.push(h("span", { class: "chip chip-muted", text: "Location not listed" }));

    var meta = [h("span", { class: "chip chip-employer", text: oneLine(r.employer) || r.source })].concat(locs);
    if (r.department) meta.push(h("span", { class: "chip chip-muted", text: oneLine(r.department) }));

    var pill = d.days == null ? null : h("span", {
      class: "pill" + (d.atLeast ? " pill-unknown" : d.days <= 3 ? " pill-fresh" : ""),
      title: d.atLeast ? "Already open when watching began; at least " + d.days + " days" : "Days open since first seen " + r.first_seen
    }, [h("strong", { text: d.days + (d.atLeast ? "+" : "") }), d.days === 1 && !d.atLeast ? " day" : " days"]);

    var apply = r.url ? h("a", {
      class: "btn btn-apply", href: r.url, target: "_blank", rel: "noopener noreferrer"
    }, [removed ? "View" : "Apply", h("span", { class: "sr-only", text: ": " + title + " at " + oneLine(r.employer) + " (opens in new tab)" }),
        h("span", { class: "arrow", "aria-hidden": "true", text: "↗" })]) :
      h("span", { class: "btn btn-apply disabled", text: "No link" });

    var li = h("li", { class: "card posting" + (removed ? " is-removed" : "") + (isNew ? " is-new" : "") }, [
      logo(r.source, r.employer, "md"),
      h("div", { class: "posting-main" }, [
        h("h3", { class: "posting-title" }, r.url ? h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer", text: title }) : title),
        h("div", { class: "posting-meta" }, meta),
        badges.length ? h("div", { class: "posting-badges" }, badges) : null
      ]),
      h("div", { class: "posting-side" }, [
        pill,
        h("span", { class: "seen", text: "First seen " + fmtShortDate(r.first_seen) }),
        h("div", { class: "posting-actions" }, [opts.star === false ? null : starButton(r), apply])
      ])
    ]);
    return li;
  }

  /**
   * Render a long list incrementally: `pageSize` cards, then a "Show more" button.
   * Keeps the DOM small even with thousands of rows.
   */
  function renderList(ul, items, cardFn, pageSize, emptyText) {
    ul.textContent = "";
    var more = ul.nextElementSibling && ul.nextElementSibling.classList.contains("more-wrap") ? ul.nextElementSibling : null;
    if (more) more.remove();
    if (!items.length) {
      ul.appendChild(h("li", { class: "empty", text: emptyText || "Nothing here." }));
      return;
    }
    var shown = 0;
    var wrap = h("div", { class: "more-wrap" });
    var btn = h("button", { type: "button", class: "btn btn-ghost" });
    wrap.appendChild(btn);
    function step() {
      var frag = document.createDocumentFragment();
      var end = Math.min(items.length, shown + pageSize);
      for (var i = shown; i < end; i++) frag.appendChild(cardFn(items[i]));
      ul.appendChild(frag);
      shown = end;
      if (shown >= items.length) wrap.remove();
      else btn.textContent = "Show " + Math.min(pageSize, items.length - shown) + " more (" + fmt(items.length - shown) + " left)";
    }
    btn.addEventListener("click", step);
    ul.after(wrap);
    step();
  }

  /* ------------------------------------------------------------ segmented toggle */
  /** Accessible segmented control built from radio buttons. options: [{value,label}] */
  function segmented(name, legend, options, value, onChange) {
    var fs = h("fieldset", { class: "seg" }, h("legend", { class: "sr-only", text: legend }));
    options.forEach(function (o) {
      var id = name + "-" + o.value;
      var input = h("input", { type: "radio", name: name, id: id, value: o.value });
      if (o.value === value) input.checked = true;
      input.addEventListener("change", function () { if (input.checked) onChange(o.value); });
      var lab = h("label", { for: id }, [o.label]);
      if (o.count != null) lab.appendChild(h("span", { class: "seg-count", text: fmt(o.count) }));
      fs.appendChild(input); fs.appendChild(lab);
    });
    return fs;
  }

  /* ------------------------------------------------------------ tooltip */
  var tip;
  function tooltip() {
    if (tip) return tip;
    tip = h("div", { class: "tooltip", role: "tooltip", hidden: true });
    document.body.appendChild(tip);
    function show(target, x, y) {
      var rows = target.getAttribute("data-tip");
      if (!rows) return;
      tip.textContent = "";
      JSON.parse(rows).forEach(function (row, i) {
        if (i === 0) { tip.appendChild(h("div", { class: "tt-head", text: row[0] })); return; }
        tip.appendChild(h("div", { class: "tt-row" }, [
          row[2] ? h("span", { class: "tt-key", style: "background:" + row[2] }) : null,
          h("strong", { text: row[1] }), h("span", { text: row[0] })
        ]));
      });
      tip.hidden = false;
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var left = Math.min(window.innerWidth - tw - 8, Math.max(8, x + 14));
      var top = y - th - 12 < 8 ? y + 16 : y - th - 12;
      tip.style.left = left + window.scrollX + "px";
      tip.style.top = top + window.scrollY + "px";
    }
    document.addEventListener("pointermove", function (e) {
      var t = e.target.closest && e.target.closest("[data-tip]");
      if (t) show(t, e.clientX, e.clientY); else tip.hidden = true;
    });
    document.addEventListener("focusin", function (e) {
      var t = e.target.closest && e.target.closest("[data-tip]");
      if (t) { var b = t.getBoundingClientRect(); show(t, b.left + b.width / 2, b.top); }
    });
    document.addEventListener("focusout", function () { tip.hidden = true; });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") tip.hidden = true; });
    return tip;
  }

  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  window.App = {
    h: h, fmt: fmt, pct: pct, plural: plural, fmtDate: fmtDate, fmtShortDate: fmtShortDate,
    fmtRunTime: fmtRunTime, oneLine: oneLine, loadData: loadData, showBanner: showBanner,
    logo: logo, initials: initials, hashHue: hashHue, employerSources: employerSources,
    Shortlist: Shortlist, starButton: starButton, cityBadges: cityBadges, postingCard: postingCard,
    renderList: renderList, segmented: segmented, tooltip: tooltip, setText: setText
  };
})();
