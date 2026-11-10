/*
 * app.js - shared browser helpers: theme toggle, nav indicator, data loading,
 * service worker registration, DOM helpers, employer logos with monogram
 * fallback, posting cards, the shortlist, count-up/reveal animations and the
 * tooltip. Depends on core.js (window.JW). No calculations live here.
 */
(function () {
  "use strict";
  var JW = window.JW;
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
        else if (k === "html") el.innerHTML = v; // only ever used with static strings from this file
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
  function fmt(n) { return n == null || isNaN(n) ? "–" : nf.format(n); }
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

  /* ------------------------------------------------------------ theme */
  var THEME_KEY = "jobwatcher.theme";
  function currentTheme() { return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.setAttribute("aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme");
      btn.setAttribute("aria-pressed", t === "light" ? "true" : "false");
    }
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.setAttribute("content", t === "light" ? "#f4f6fb" : "#060912"); });
  }
  function initTheme() {
    applyTheme(currentTheme());
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var next = currentTheme() === "light" ? "dark" : "light";
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* storage blocked */ }
      document.dispatchEvent(new CustomEvent("theme:change", { detail: next }));
    });
  }

  /* ------------------------------------------------------------ nav indicator */
  function initNav() {
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var links = Array.prototype.slice.call(nav.querySelectorAll("a"));
    var cur = nav.querySelector('a[aria-current="page"]');
    if (!cur) return;
    var ind = h("span", { class: "nav-indicator", "aria-hidden": "true" });
    nav.insertBefore(ind, nav.firstChild);
    function place(a, animate) {
      if (!animate) ind.style.transition = "none";
      ind.style.width = a.offsetWidth + "px";
      ind.style.transform = "translateX(" + a.offsetLeft + "px)";
      if (!animate) { void ind.offsetWidth; ind.style.transition = ""; }
    }
    var prevIdx = -1;
    try { prevIdx = +sessionStorage.getItem("jobwatcher.navIdx"); } catch (e) { /* ignore */ }
    var idx = links.indexOf(cur);
    if (!REDUCED && prevIdx >= 0 && prevIdx !== idx && links[prevIdx]) {
      place(links[prevIdx], false);
      requestAnimationFrame(function () { requestAnimationFrame(function () { place(cur, true); }); });
    } else place(cur, false);
    nav.classList.add("ready");
    links.forEach(function (a, i) { a.addEventListener("click", function () { try { sessionStorage.setItem("jobwatcher.navIdx", String(idx)); } catch (e) { /* ignore */ } }); });
    window.addEventListener("resize", function () { place(cur, false); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { place(cur, false); });
  }

  /* ------------------------------------------------------------ data */
  function fetchData(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error(path + ": HTTP " + res.status);
      return { res: res, cached: res.headers.get("X-JW-From-Cache") === "1" };
    });
  }

  /** Load status.json and history.csv -> { status, records, lastDate, fromCache, errors[] }. */
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
      var out = { status: status, records: records, lastDate: JW.lastRunDate(status, records), fromCache: v[0].cached || v[1].cached, errors: errors };
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
  // assets/logos/<source>.png; the monogram shows until it loads or if it 404s.
  // One probe request per file; small source files are shown at natural size.
  var logoState = new Map();   // src -> {ok, w}
  var logoWaiting = new Map(); // src -> [badges]
  var LOGO_PX = { sm: 28, md: 44, lg: 56 };

  function initials(name) {
    var words = oneLine(name).replace(/[^A-Za-z0-9&' ]+/g, " ").split(" ").filter(function (w) {
      return w && !/^(inc|llc|llp|ltd|co|corp|the|and|of|&|group|americas)$/i.test(w);
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
  function logoSlug(source) { return String(source || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-"); }

  function attachImg(box, src, natural, size) {
    var img = h("img", { src: src, alt: "", loading: "lazy", decoding: "async" });
    if (natural && natural < (LOGO_PX[size] || 44) * 0.72) img.className = "native";
    img.addEventListener("load", function () { box.classList.add("has-img"); });
    img.addEventListener("error", function () { img.remove(); box.classList.remove("has-img"); });
    box.appendChild(img);
    if (img.complete && img.naturalWidth) box.classList.add("has-img");
  }

  /** Logo badge. size: "sm" | "md" | "lg". */
  function logo(source, employer, size) {
    size = size || "md";
    var box = h("span", { class: "logo logo-" + size, style: "--logo-h:" + hashHue(employer || source), "aria-hidden": "true" },
      h("span", { class: "logo-mono", text: initials(employer || source) }));
    if (!source) return box;
    var src = "assets/logos/" + logoSlug(source) + ".png";
    var st = logoState.get(src);
    if (st) { if (st.ok) attachImg(box, src, st.w, size); return box; }
    var waiting = logoWaiting.get(src);
    if (!waiting) {
      waiting = [];
      logoWaiting.set(src, waiting);
      var probe = new Image();
      probe.onload = function () {
        var s = { ok: true, w: Math.min(probe.naturalWidth, probe.naturalHeight) };
        logoState.set(src, s);
        logoWaiting.get(src).forEach(function (b) { if (b.isConnected) attachImg(b.el, src, s.w, b.size); });
        logoWaiting.delete(src);
      };
      probe.onerror = function () { logoState.set(src, { ok: false }); logoWaiting.delete(src); };
      probe.src = src;
    }
    waiting.push({ el: box, size: size, get isConnected() { return box.isConnected; } });
    return box;
  }

  /** employer -> source lookup built from history rows. */
  function employerSources(records) {
    var m = new Map();
    records.forEach(function (r) { if (r.employer && !m.has(r.employer)) m.set(r.employer, r.source); });
    return m;
  }

  /* ------------------------------------------------------------ category tags (display only) */
  // Derived from the title for the card only. Never used for the role switch or any number.
  var TAG_RULES = [
    { key: "Accounting", cls: "tag-accounting", re: /account|controller|bookkeep|\bcpa\b|payable|receivable|payroll|general ledger|\bgl\b|revenue recognition|financial reporting|technical accounting/i },
    { key: "Audit", cls: "tag-audit", re: /audit|assurance|internal controls?|\bsox\b/i },
    { key: "Tax", cls: "tag-tax", re: /\btax/i },
    { key: "Finance", cls: "tag-finance", re: /financ|fp&a|fp & a|\bfpa\b|treasury|credit|invest|valuation|transaction|capital|\brisk\b|portfolio|banking|equity|wealth|asset management|\bm&a\b|deals?\b|underwrit|budget|cash management|corporate development|restructuring|quant/i },
    { key: "Consulting", cls: "tag-consulting", re: /consult|advisory|advisor/i }
  ];
  function categoryTags(title) {
    var t = String(title || "");
    return TAG_RULES.filter(function (r) { return r.re.test(t); });
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
  window.addEventListener("storage", function (e) { if (e.key === SL_KEY) Shortlist._set = null; });

  var STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>' +
    '<span class="burst" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>';
  function starButton(r) {
    var on = Shortlist.has(r.posting_id);
    var label = function (o) { return (o ? "Remove from" : "Add to") + " shortlist: " + oneLine(r.title); };
    var btn = h("button", { type: "button", class: "star" + (on ? " on" : ""), "aria-pressed": on ? "true" : "false", "aria-label": label(on), html: STAR_SVG });
    btn.addEventListener("click", function () {
      var now = Shortlist.toggle(r.posting_id);
      btn.classList.toggle("on", now);
      btn.classList.remove("pop");
      if (now && !REDUCED) { void btn.offsetWidth; btn.classList.add("pop"); }
      btn.setAttribute("aria-pressed", now ? "true" : "false");
      btn.setAttribute("aria-label", label(now));
    });
    return btn;
  }

  /* ------------------------------------------------------------ posting card */
  var CITY_SLUG = { NYC: "nyc", Nashville: "nashville", Chicago: "chicago" };
  var CITY_NAME = { NYC: "NYC", Nashville: "Nashville", Chicago: "Chicago" };
  var PIN_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';

  function cityBadges(loc) {
    return JW.classifyCity(loc).map(function (c) {
      return h("span", { class: "badge badge-city city-" + CITY_SLUG[c], title: "Target city: " + c }, [
        h("span", { class: "pin", "aria-hidden": "true" }), CITY_NAME[c]
      ]);
    });
  }

  function splitLocations(loc) {
    var s = String(loc == null ? "" : loc).trim();
    if (!s) return [];
    var parts = s.split(/\s*(?:;|\||\n|\s\/\s)\s*/).map(oneLine).filter(Boolean);
    return parts.length > 3 ? parts.slice(0, 3).concat(["+" + (parts.length - 3) + " more"]) : parts;
  }

  /** One posting rendered as a card <li>. opts: { lastDate, index } */
  function postingCard(r, opts) {
    opts = opts || {};
    var title = oneLine(r.title) || "(untitled posting)";
    var employer = oneLine(r.employer) || r.source;
    var d = JW.daysOpen(r, opts.lastDate);
    var isNew = r.first_seen === opts.lastDate && !r.firstRun;
    var removed = r.status === "removed";

    var badges = [];
    if (isNew) badges.push(h("span", { class: "badge badge-new", text: "New" }));
    if (removed) badges.push(h("span", { class: "badge badge-removed", text: "Removed " + fmtShortDate(r.removed_date) }));
    categoryTags(r.title).forEach(function (t) { badges.push(h("span", { class: "badge badge-tag " + t.cls, text: t.key })); });
    badges = badges.concat(cityBadges(r.location));

    var meta = splitLocations(r.location).map(function (l) { return h("span", { class: "chip", html: PIN_SVG }, l); });
    if (!meta.length) meta.push(h("span", { class: "chip chip-muted", text: "Location not listed" }));
    if (r.department) meta.push(h("span", { class: "chip chip-muted", text: oneLine(r.department) }));

    var pill = d.days == null ? null : h("span", {
      class: "pill" + (d.atLeast ? " pill-unknown" : d.days <= 3 ? " pill-fresh" : ""),
      title: d.atLeast ? "Already open when watching began; open at least " + d.days + " days" : "Days open since first seen " + r.first_seen
    }, [h("strong", { text: d.days + (d.atLeast ? "+" : "") }), d.days === 1 && !d.atLeast ? " day open" : " days open"]);

    var apply = r.url ? h("a", { class: "btn btn-apply", href: r.url, target: "_blank", rel: "noopener noreferrer" }, [
      removed ? "View" : "Apply",
      h("span", { class: "sr-only", text: ": " + title + " at " + employer + " (opens in new tab)" }),
      h("span", { class: "arrow", "aria-hidden": "true", text: "↗" })
    ]) : h("span", { class: "btn btn-apply disabled", text: "No link" });

    var li = h("li", { class: "card posting" + (removed ? " is-removed" : "") + (isNew ? " is-new" : ""), style: "--i:" + Math.min(opts.index || 0, 20) }, [
      logo(r.source, employer, "lg"),
      h("div", { class: "posting-main" }, [
        h("div", { class: "posting-employer", text: employer }),
        h("h3", { class: "posting-title" }, r.url ? h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer", text: title }) : title),
        h("div", { class: "posting-meta" }, meta),
        badges.length ? h("div", { class: "posting-badges" }, badges) : null
      ]),
      h("div", { class: "posting-side" }, [
        pill,
        h("span", { class: "seen", text: "First seen " + fmtShortDate(r.first_seen) }),
        h("div", { class: "posting-actions" }, [starButton(r), apply])
      ])
    ]);
    return li;
  }

  /* ------------------------------------------------------------ empty / skeleton */
  var EMPTY_ICONS = {
    search: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><circle cx="28" cy="28" r="16" opacity=".9"/><path d="M40 40l14 14"/><path d="M22 28h12" opacity=".6"/></svg>',
    calm: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M8 44c8-10 16-10 24 0s16 10 24 0" opacity=".5"/><circle cx="32" cy="22" r="9"/><path d="M32 5v4M49 22h-4M19 22h-4M44 10l-3 3M20 10l3 3" opacity=".7"/></svg>',
    star: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" aria-hidden="true"><path d="M32 8l7 14.5 16 2.3-11.6 11.3 2.7 15.9L32 44.5 17.9 52l2.7-15.9L9 24.8l16-2.3z"/></svg>',
    chart: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M10 54h44" opacity=".6"/><path d="M18 46V34M30 46V22M42 46V28" /><path d="M50 12l-6 6M44 12l6 6" opacity=".7"/></svg>'
  };
  function emptyState(icon, title, text, tag) {
    return h(tag || "li", { class: "empty" }, [
      h("span", { html: EMPTY_ICONS[icon] || EMPTY_ICONS.calm }),
      h("strong", { text: title }),
      text ? h("p", { text: text }) : null
    ]);
  }

  /**
   * Render a long list incrementally: `pageSize` cards, then a "Show more" button.
   * Keeps the DOM small even with thousands of rows.
   */
  function renderList(ul, items, cardFn, pageSize, empty) {
    ul.textContent = "";
    var next = ul.nextElementSibling;
    if (next && next.classList.contains("more-wrap")) next.remove();
    if (!items.length) { ul.appendChild(empty || emptyState("calm", "Nothing here.")); return; }
    var shown = 0;
    var wrap = h("div", { class: "more-wrap" });
    var btn = h("button", { type: "button", class: "btn btn-ghost" });
    wrap.appendChild(btn);
    function step() {
      var frag = document.createDocumentFragment();
      var end = Math.min(items.length, shown + pageSize);
      for (var i = shown; i < end; i++) frag.appendChild(cardFn(items[i], i - shown));
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

  /* ------------------------------------------------------------ motion helpers */
  /** Animate a number from 0 to `to` (instantly under reduced motion). */
  function countUp(el, to, opts) {
    opts = opts || {};
    var format = opts.format || fmt;
    if (to == null || isNaN(to)) { el.textContent = "–"; return; }
    if (REDUCED || to === 0) { el.textContent = format(to); return; }
    var dur = opts.duration || 1100, t0 = null;
    function frame(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(p < 1 ? Math.round(to * e) : to);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  var io = null;
  /** Reveal `.reveal` elements and start chart entrances (`.chart.pre`) when they scroll into view. */
  function observe(el) {
    if (!el) return;
    if (REDUCED || !("IntersectionObserver" in window)) { el.classList.add("in"); el.classList.remove("pre"); return; }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add("in");
          en.target.classList.remove("pre");
          io.unobserve(en.target);
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    }
    io.observe(el);
  }
  function revealAll(root) { (root || document).querySelectorAll(".reveal:not(.in)").forEach(observe); }

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
    document.addEventListener("scroll", function () { tip.hidden = true; }, { passive: true });
    return tip;
  }

  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  /* ------------------------------------------------------------ boot */
  function boot() { initTheme(); initNav(); revealAll(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  window.App = {
    h: h, fmt: fmt, pct: pct, plural: plural, fmtDate: fmtDate, fmtShortDate: fmtShortDate,
    fmtRunTime: fmtRunTime, oneLine: oneLine, loadData: loadData, showBanner: showBanner,
    logo: logo, initials: initials, hashHue: hashHue, employerSources: employerSources,
    categoryTags: categoryTags, Shortlist: Shortlist, starButton: starButton, cityBadges: cityBadges,
    postingCard: postingCard, emptyState: emptyState, renderList: renderList, segmented: segmented,
    tooltip: tooltip, setText: setText, countUp: countUp, observe: observe, revealAll: revealAll,
    REDUCED: REDUCED, CITY_SLUG: CITY_SLUG
  };
})();
