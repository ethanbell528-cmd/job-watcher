/* browse.js - the Browse page: filters, search, sort, pagination, shortlist. */
(function () {
  "use strict";
  var JW = window.JW, App = window.App, h = App.h;
  var PAGE = 50;

  var $ = function (id) { return document.getElementById(id); };
  var state = { scope: "role", employer: "", location: "", age: "", q: "", sort: "desc", shortlistOnly: false, page: 0 };
  var data = null;
  var empList = [], locList = []; // option index -> exact string

  function openIn(scope) {
    return data.records.filter(function (r) { return JW.isOpen(r) && (scope === "all" || r.inRole); });
  }

  /** Rebuild employer + location dropdowns for the current scope, keeping the selection. */
  function buildOptions() {
    var base = openIn(state.scope);
    // employers
    var emp = JW.sortedCounts(JW.countBy(base, function (r) { return r.employer; }));
    emp.sort(function (a, b) { return a.key.toLowerCase() < b.key.toLowerCase() ? -1 : 1; });
    if (state.employer && !emp.some(function (e) { return e.key === state.employer; })) emp.push({ key: state.employer, count: 0 });
    empList = emp.map(function (e) { return e.key; });
    var sel = $("employer");
    sel.textContent = "";
    sel.appendChild(h("option", { value: "", text: "All employers (" + App.fmt(base.length) + ")" }));
    emp.forEach(function (e, i) {
      sel.appendChild(h("option", { value: "e" + i, text: App.oneLine(e.key) + " (" + App.fmt(e.count) + ")" }));
    });
    sel.value = state.employer ? "e" + empList.indexOf(state.employer) : "";

    // locations
    var city = JW.openByTargetCity(base);
    var locs = JW.sortedCounts(JW.countBy(base, function (r) { return r.location; }));
    locList = locs.map(function (l) { return l.key; });
    var ls = $("location");
    ls.textContent = "";
    ls.appendChild(h("option", { value: "", text: "All locations" }));
    ls.appendChild(h("optgroup", { label: "My cities" }, [
      h("option", { value: "city:any", text: "My cities (NYC / Nashville / Chicago) (" + App.fmt(city.any) + ")" }),
      h("option", { value: "city:NYC", text: "New York City (" + App.fmt(city.NYC) + ")" }),
      h("option", { value: "city:Nashville", text: "Nashville (" + App.fmt(city.Nashville) + ")" }),
      h("option", { value: "city:Chicago", text: "Chicago (" + App.fmt(city.Chicago) + ")" })
    ]));
    var grp = h("optgroup", { label: "All individual locations (by open postings)" });
    locs.forEach(function (l, i) {
      grp.appendChild(h("option", { value: "l" + i, text: (App.oneLine(l.key) || "(no location listed)") + " (" + App.fmt(l.count) + ")" }));
    });
    ls.appendChild(grp);
    if (state.location.indexOf("loc:") === 0) {
      var idx = locList.indexOf(state.location.slice(4));
      if (idx === -1) state.location = "";
      ls.value = idx === -1 ? "" : "l" + idx;
    } else ls.value = state.location;
    syncChips();
  }

  function syncChips() {
    $("cities-chip").setAttribute("aria-pressed", String(state.location === "city:any"));
    $("shortlist-chip").setAttribute("aria-pressed", String(state.shortlistOnly));
    $("shortlist-count").textContent = App.fmt(App.Shortlist.size());
  }

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

    var what = state.shortlistOnly ? "shortlisted posting" : (state.scope === "all" ? "open posting" : "open posting in my role");
    var whats = what.replace("posting", "postings");
    $("result-count").textContent = list.length ?
      App.fmt(list.length) + " " + (list.length === 1 ? what : whats) + " · showing " + App.fmt(start + 1) + "–" + App.fmt(start + slice.length) :
      "No " + whats + " match these filters.";

    var ul = $("list");
    ul.textContent = "";
    if (!slice.length) {
      ul.appendChild(h("li", { class: "empty", text: state.shortlistOnly && !App.Shortlist.size() ?
        "Your shortlist is empty. Tap the star on any posting to save it here." :
        "Nothing matches. Try widening the filters" + (state.scope === "role" && !state.shortlistOnly ? " or switch to All postings." : ".") }));
    } else {
      var frag = document.createDocumentFragment();
      slice.forEach(function (r) { frag.appendChild(App.postingCard(r, { lastDate: data.lastDate })); });
      ul.appendChild(frag);
    }
    renderPager(pages);
    syncChips();
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
      b.addEventListener("click", function () { state.page = page; run(true); $("result-count").scrollIntoView({ block: "start" }); });
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

  function wire() {
    var scopeHost = $("scope-host");
    var roleN = openIn("role").length, allN = openIn("all").length;
    scopeHost.appendChild(App.segmented("scope", "Which postings", [
      { value: "role", label: "My role", count: roleN },
      { value: "all", label: "All postings", count: allN }
    ], state.scope, function (v) { state.scope = v; buildOptions(); run(); }));

    $("employer").addEventListener("change", function (e) {
      var v = e.target.value; state.employer = v ? empList[+v.slice(1)] : ""; run();
    });
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
      state.location = state.location === "city:any" ? "" : "city:any";
      $("location").value = state.location;
      run();
    });
    $("shortlist-chip").addEventListener("click", function () { state.shortlistOnly = !state.shortlistOnly; run(); });
    $("reset").addEventListener("click", function () {
      state.employer = ""; state.location = ""; state.age = ""; state.q = ""; state.sort = "desc"; state.shortlistOnly = false;
      $("q").value = ""; $("age").value = ""; $("sort").value = "desc";
      buildOptions(); run();
    });
    document.addEventListener("shortlist:change", syncChips);
  }

  App.loadData().then(function (d) {
    data = d;
    $("as-of").textContent = d.lastDate ? App.fmtDate(d.lastDate) + " (UTC)" : "the last run";
    wire();
    buildOptions();
    run();
  });
})();
