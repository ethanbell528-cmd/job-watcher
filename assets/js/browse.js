/* browse.js - the Browse page: filters, search, sort, pagination, shortlist.
 * URL parameters (all optional): city=nyc|chicago|nashville|mine, employer=<name>,
 * scope=all, q=<text>, age=le:7|gt:30|firstrun, sort=asc, shortlist=1, page=<n>. */
(function () {
  "use strict";
  var JW = window.JW, App = window.App, h = App.h;
  var PAGE = 40;
  var ROLE = "Accounting & finance";

  var $ = function (id) { return document.getElementById(id); };
  var state = { scope: "role", employer: "", location: "", age: "", q: "", sort: "desc", shortlistOnly: false, page: 0 };
  var data = null;
  var empList = [], locList = []; // option index -> exact string
  var CITY_PARAM = { nyc: "city:NYC", chicago: "city:Chicago", nashville: "city:Nashville", mine: "city:any", any: "city:any" };
  var CITY_LABEL = { "city:any": "My cities", "city:NYC": "New York City", "city:Chicago": "Chicago", "city:Nashville": "Nashville" };
  var AGE_OK = /^(le|gt):\d+$|^firstrun$/;

  /* ------------------------------------------------------------ URL state */
  function readURL() {
    var p = new URLSearchParams(location.search);
    if (p.get("scope") === "all") state.scope = "all";
    var city = (p.get("city") || "").toLowerCase();
    if (CITY_PARAM[city]) state.location = CITY_PARAM[city];
    if (p.get("location")) state.location = "loc:" + p.get("location");
    if (p.get("employer")) state.employer = p.get("employer");
    if (p.get("q")) state.q = p.get("q");
    if (AGE_OK.test(p.get("age") || "")) state.age = p.get("age");
    if (p.get("sort") === "asc") state.sort = "asc";
    if (p.get("shortlist") === "1") state.shortlistOnly = true;
    if (+p.get("page") > 1) state.page = +p.get("page") - 1;
  }
  function writeURL() {
    var p = new URLSearchParams();
    if (state.scope === "all") p.set("scope", "all");
    if (state.location.indexOf("city:") === 0) {
      var k = state.location.slice(5);
      p.set("city", k === "any" ? "mine" : k.toLowerCase());
    } else if (state.location.indexOf("loc:") === 0) p.set("location", state.location.slice(4));
    if (state.employer) p.set("employer", state.employer);
    if (state.q) p.set("q", state.q);
    if (state.age) p.set("age", state.age);
    if (state.sort === "asc") p.set("sort", "asc");
    if (state.shortlistOnly) p.set("shortlist", "1");
    if (state.page > 0) p.set("page", String(state.page + 1));
    var qs = p.toString();
    try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "")); } catch (e) { /* ignore */ }
  }

  function openIn(scope) {
    return data.records.filter(function (r) { return JW.isOpen(r) && (scope === "all" || r.inRole); });
  }

  /** Match an employer from the URL case-insensitively against the history. */
  function resolveEmployer(name) {
    if (!name) return "";
    var exact = null, loose = null, n = name.trim().toLowerCase();
    for (var i = 0; i < data.records.length; i++) {
      var e = data.records[i].employer;
      if (e === name) { exact = e; break; }
      if (!loose && (e.toLowerCase() === n || data.records[i].source.toLowerCase() === n)) loose = e;
    }
    return exact || loose || name;
  }

  /* ------------------------------------------------------------ dropdowns */
  function buildOptions() {
    var base = openIn(state.scope);
    var emp = JW.sortedCounts(JW.countBy(base, function (r) { return r.employer; }));
    emp.sort(function (a, b) { return a.key.toLowerCase() < b.key.toLowerCase() ? -1 : 1; });
    if (state.employer && !emp.some(function (e) { return e.key === state.employer; })) emp.push({ key: state.employer, count: 0 });
    empList = emp.map(function (e) { return e.key; });
    var sel = $("employer");
    sel.textContent = "";
    sel.appendChild(h("option", { value: "", text: "All employers (" + App.fmt(base.length) + ")" }));
    emp.forEach(function (e, i) { sel.appendChild(h("option", { value: "e" + i, text: App.oneLine(e.key) + " (" + App.fmt(e.count) + ")" })); });
    sel.value = state.employer ? "e" + empList.indexOf(state.employer) : "";

    var city = JW.openByTargetCity(base);
    var locs = JW.sortedCounts(JW.countBy(base, function (r) { return r.location; }));
    locList = locs.map(function (l) { return l.key; });
    var ls = $("location");
    ls.textContent = "";
    ls.appendChild(h("option", { value: "", text: "All locations" }));
    ls.appendChild(h("optgroup", { label: "My cities" }, [
      h("option", { value: "city:any", text: "My cities: NYC / Chicago / Nashville (" + App.fmt(city.any) + ")" }),
      h("option", { value: "city:NYC", text: "New York City (" + App.fmt(city.NYC) + ")" }),
      h("option", { value: "city:Chicago", text: "Chicago (" + App.fmt(city.Chicago) + ")" }),
      h("option", { value: "city:Nashville", text: "Nashville (" + App.fmt(city.Nashville) + ")" })
    ]));
    var grp = h("optgroup", { label: "All individual locations (by open postings)" });
    locs.forEach(function (l, i) { grp.appendChild(h("option", { value: "l" + i, text: (App.oneLine(l.key) || "(no location listed)") + " (" + App.fmt(l.count) + ")" })); });
    ls.appendChild(grp);
    if (state.location.indexOf("loc:") === 0) {
      var idx = locList.indexOf(state.location.slice(4));
      if (idx === -1) { locList.push(state.location.slice(4)); idx = locList.length - 1; grp.appendChild(h("option", { value: "l" + idx, text: App.oneLine(state.location.slice(4)) + " (0)" })); }
      ls.value = "l" + idx;
    } else ls.value = state.location;
    syncControls();
  }

  function syncControls() {
    var cities = state.location.indexOf("city:") === 0;
    $("cities-chip").setAttribute("aria-pressed", String(cities));
    $("shortlist-chip").setAttribute("aria-pressed", String(state.shortlistOnly));
    $("shortlist-count").textContent = App.fmt(App.Shortlist.size());
    if ($("q").value !== state.q) $("q").value = state.q;
    $("age").value = state.age; $("sort").value = state.sort;
    var radio = document.querySelector('input[name="scope"][value="' + state.scope + '"]');
    if (radio) radio.checked = true;
  }

  /* ------------------------------------------------------------ active-filter chips */
  function renderActive() {
    var host = $("active-filters");
    host.textContent = "";
    var chips = [];
    function chip(label, clear) {
      var b = h("button", { type: "button", class: "af-chip", "aria-label": "Remove filter: " + label }, [label, h("span", { class: "x", "aria-hidden": "true", text: "×" })]);
      b.addEventListener("click", function () { clear(); buildOptions(); run(); });
      chips.push(b);
    }
    if (state.shortlistOnly) chip("Shortlist only", function () { state.shortlistOnly = false; });
    if (state.employer) chip("Employer: " + App.oneLine(state.employer), function () { state.employer = ""; });
    if (state.location) chip(state.location.indexOf("loc:") === 0 ? "Location: " + (App.oneLine(state.location.slice(4)) || "(none listed)") : CITY_LABEL[state.location],
      function () { state.location = ""; });
    if (state.age) { var o = $("age").querySelector('option[value="' + state.age + '"]'); chip("Days open: " + (o ? o.textContent : state.age), function () { state.age = ""; }); }
    if (state.q) chip("Title: “" + state.q + "”", function () { state.q = ""; });
    if (state.sort === "asc") chip("Oldest first", function () { state.sort = "desc"; });
    if (!chips.length) return;
    chips.forEach(function (c) { host.appendChild(c); });
    var clr = h("button", { type: "button", class: "af-clear", text: "Clear all" });
    clr.addEventListener("click", resetAll);
    host.appendChild(clr);
  }

  /* ------------------------------------------------------------ results */
  function run(keepPage) {
    if (!keepPage) state.page = 0;
    var list = JW.filterPostings(data.records, {
      scope: state.shortlistOnly ? "all" : state.scope,
      employer: state.employer, location: state.location, age: state.age, q: state.q,
      sort: state.sort, shortlistOnly: state.shortlistOnly, shortlist: App.Shortlist.load(),
      lastDate: data.lastDate
    });
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (state.page >= pages) state.page = pages - 1;
    var start = state.page * PAGE, slice = list.slice(start, start + PAGE);

    var what = state.shortlistOnly ? "shortlisted" : state.scope === "all" ? "open" : "open accounting & finance";
    var rc = $("result-count");
    rc.textContent = "";
    if (list.length) {
      rc.appendChild(h("strong", { text: App.fmt(list.length) }));
      rc.appendChild(document.createTextNode(" " + what + " posting" + (list.length === 1 ? "" : "s") + " · showing " + App.fmt(start + 1) + "–" + App.fmt(start + slice.length)));
    } else rc.textContent = "No " + what + " postings match.";

    var ul = $("list");
    ul.textContent = "";
    if (!slice.length) {
      ul.appendChild(state.shortlistOnly && !App.Shortlist.size() ?
        App.emptyState("star", "Your shortlist is empty", "Tap the star on any posting to save it here. It stays in this browser, even after a reload.") :
        App.emptyState("search", "No postings match these filters", state.scope === "role" && !state.shortlistOnly ?
          "Try clearing a filter, or switch to All postings to include every role." : "Try clearing a filter."));
    } else {
      var frag = document.createDocumentFragment();
      slice.forEach(function (r, i) { frag.appendChild(App.postingCard(r, { lastDate: data.lastDate, index: i })); });
      ul.appendChild(frag);
    }
    renderPager(pages);
    renderActive();
    syncControls();
    writeURL();
  }

  function renderPager(pages) {
    var nav = $("pager");
    nav.textContent = "";
    if (pages <= 1) return;
    var cur = state.page;
    function btn(label, page, opts) {
      opts = opts || {};
      var b = h("button", { type: "button", class: "pg" + (opts.current ? " current" : ""), "aria-label": opts.aria || "Page " + (page + 1),
        "aria-current": opts.current ? "page" : null, disabled: opts.disabled ? true : null, text: label });
      b.addEventListener("click", function () {
        state.page = page; run(true);
        $("result-count").scrollIntoView({ block: "start", behavior: App.REDUCED ? "auto" : "smooth" });
      });
      return b;
    }
    nav.appendChild(btn("← Prev", cur - 1, { disabled: cur === 0, aria: "Previous page" }));
    var shown = {};
    [0, cur - 2, cur - 1, cur, cur + 1, cur + 2, pages - 1].forEach(function (p) { if (p >= 0 && p < pages) shown[p] = 1; });
    var prev = -1;
    Object.keys(shown).map(Number).sort(function (a, b) { return a - b; }).forEach(function (p) {
      if (p - prev > 1) nav.appendChild(h("span", { class: "pg-gap", "aria-hidden": "true", text: "…" }));
      nav.appendChild(btn(String(p + 1), p, { current: p === cur }));
      prev = p;
    });
    nav.appendChild(btn("Next →", cur + 1, { disabled: cur === pages - 1, aria: "Next page" }));
  }

  function resetAll() {
    state.employer = ""; state.location = ""; state.age = ""; state.q = ""; state.sort = "desc"; state.shortlistOnly = false;
    buildOptions(); run();
  }

  function wire() {
    $("scope-host").appendChild(App.segmented("scope", "Which postings", [
      { value: "role", label: ROLE, count: openIn("role").length },
      { value: "all", label: "All postings", count: openIn("all").length }
    ], state.scope, function (v) { state.scope = v; buildOptions(); run(); }));

    $("employer").addEventListener("change", function (e) { var v = e.target.value; state.employer = v ? empList[+v.slice(1)] : ""; run(); });
    $("location").addEventListener("change", function (e) {
      var v = e.target.value;
      state.location = /^l\d+$/.test(v) ? "loc:" + locList[+v.slice(1)] : v;
      run();
    });
    $("age").addEventListener("change", function (e) { state.age = e.target.value; run(); });
    $("sort").addEventListener("change", function (e) { state.sort = e.target.value; run(); });
    var t;
    $("q").addEventListener("input", function (e) {
      clearTimeout(t);
      t = setTimeout(function () { state.q = e.target.value; run(); }, 140);
    });
    $("cities-chip").addEventListener("click", function () {
      state.location = state.location.indexOf("city:") === 0 ? "" : "city:any";
      $("location").value = state.location;
      run();
    });
    $("shortlist-chip").addEventListener("click", function () { state.shortlistOnly = !state.shortlistOnly; run(); });
    $("reset").addEventListener("click", resetAll);
    document.addEventListener("shortlist:change", function () { $("shortlist-count").textContent = App.fmt(App.Shortlist.size()); });
  }

  App.loadData().then(function (d) {
    data = d;
    readURL();
    state.employer = resolveEmployer(state.employer);
    $("as-of").textContent = d.lastDate ? App.fmtDate(d.lastDate) + " (UTC)" : "the last run";
    var page = state.page;
    wire();
    buildOptions();
    state.page = page;
    run(true);
  });
})();
