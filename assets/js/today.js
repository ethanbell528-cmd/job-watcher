/* today.js - the Today page (index.html). */
(function () {
  "use strict";
  var JW = window.JW, App = window.App, h = App.h;
  var ROLE = "Accounting & finance";

  /* ------------------------------------------------------------ skylines */
  // Each building: [x, width, height, top] on a 300 x 96 canvas; top = flat|spire|point|twin|step|crown
  var SKYLINES = {
    NYC: [[0, 18, 26], [16, 14, 40], [28, 20, 33], [46, 12, 52, "point"], [56, 22, 44], [76, 18, 62, "step"], [92, 16, 38], [106, 22, 48],
      [126, 12, 58, "point"], [136, 20, 36], [154, 16, 46], [168, 26, 72, "spire"], [192, 18, 40], [208, 14, 54], [220, 24, 30], [242, 16, 44], [256, 20, 34], [274, 26, 24]],
    Chicago: [[0, 22, 28], [20, 16, 42], [34, 20, 34], [52, 14, 50], [64, 24, 40], [86, 18, 58, "crown"], [102, 26, 76, "twin"], [126, 16, 46], [140, 22, 52],
      [160, 14, 36], [172, 20, 64, "spire"], [190, 18, 40], [206, 24, 48], [228, 14, 30], [240, 22, 44], [260, 16, 36], [274, 26, 26]],
    Nashville: [[0, 26, 22], [24, 18, 34], [40, 22, 28], [60, 16, 40], [74, 20, 30], [92, 14, 46], [104, 26, 70, "twin"], [128, 18, 42], [144, 22, 50, "step"],
      [164, 16, 34], [178, 20, 44], [196, 26, 30], [220, 16, 38], [234, 22, 26], [254, 18, 32], [270, 30, 22]]
  };
  function skylineSVG(city) {
    var H = 96, d = "", wins = "";
    SKYLINES[city].forEach(function (b) {
      var x = b[0], w = b[1], top = H - b[2], kind = b[3];
      d += "M" + x + " " + H + "V" + top + "H" + (x + w) + "V" + H + "Z";
      if (kind === "spire") d += "M" + (x + w / 2 - 1.2) + " " + top + "V" + (top - 16) + "H" + (x + w / 2 + 1.2) + "V" + top + "Z";
      if (kind === "point") d += "M" + x + " " + top + "L" + (x + w / 2) + " " + (top - 12) + "L" + (x + w) + " " + top + "Z";
      if (kind === "twin") d += "M" + (x + w * .2) + " " + top + "L" + (x + w * .3) + " " + (top - 16) + "L" + (x + w * .4) + " " + top + "Z" +
        "M" + (x + w * .6) + " " + top + "L" + (x + w * .7) + " " + (top - 16) + "L" + (x + w * .8) + " " + top + "Z";
      if (kind === "step") d += "M" + (x + w * .2) + " " + top + "V" + (top - 8) + "H" + (x + w * .8) + "V" + top + "Z" +
        "M" + (x + w / 2 - 1) + " " + (top - 8) + "V" + (top - 18) + "H" + (x + w / 2 + 1) + "V" + (top - 8) + "Z";
      if (kind === "crown") d += "M" + (x + 2) + " " + top + "V" + (top - 6) + "H" + (x + w - 2) + "V" + top + "Z";
      for (var wy = top + 6; wy < H - 6; wy += 9) {
        for (var wx = x + 4; wx < x + w - 4; wx += 6) {
          if (((wx * 7 + wy * 13) % 5) < 2) wins += '<rect class="win" x="' + wx + '" y="' + wy + '" width="2" height="3"/>';
        }
      }
    });
    var id = "sk-" + city;
    return '<svg viewBox="0 0 300 96" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="currentColor" stop-opacity=".95"/><stop offset="1" stop-color="currentColor" stop-opacity=".35"/></linearGradient></defs>' +
      '<path d="' + d + '" fill="url(#' + id + ')"/>' + wins + "</svg>";
  }

  var CITIES = [
    { key: "NYC", name: "New York City", tag: "All five boroughs", slug: "nyc" },
    { key: "Chicago", name: "Chicago", tag: "Illinois", slug: "chicago" },
    { key: "Nashville", name: "Nashville", tag: "incl. Franklin & Brentwood", slug: "nashville" }
  ];

  function renderCities(recs) {
    var host = document.getElementById("cities");
    host.textContent = "";
    var open = recs.filter(JW.isOpen);
    CITIES.forEach(function (c) {
      var inCity = open.filter(function (r) { return JW.classifyCity(r.location).indexOf(c.key) !== -1; });
      var role = inCity.filter(function (r) { return r.inRole; });
      var emps = JW.sortedCounts(JW.countBy(role, function (r) { return r.employer; }));
      var src = App.employerSources(role);
      var countEl = h("span", { class: "city-count", text: "0" });
      var card = h("a", { class: "city-card city-" + c.slug, href: "browse.html?city=" + c.slug,
        "aria-label": c.name + ": " + App.fmt(role.length) + " open accounting and finance postings. Browse them." }, [
        h("div", { class: "city-top" }, [h("span", { class: "city-name", text: c.name }), h("span", { class: "city-tag", text: c.tag })]),
        countEl,
        h("div", { class: "city-sub", text: "open accounting & finance roles · " + App.fmt(inCity.length) + " open in all roles" }),
        h("div", { class: "city-emps" }, emps.slice(0, 5).map(function (e) { return App.logo(src.get(e.key), e.key, "sm"); })
          .concat(emps.length > 5 ? [h("span", { class: "more", text: "+" + (emps.length - 5) + " more" })] :
            emps.length ? [h("span", { class: "more", text: App.plural(emps.length, "employer") })] : [h("span", { class: "more", text: "No openings right now" })])),
        h("div", { class: "skyline", html: skylineSVG(c.key) }),
        h("span", { class: "city-cta", "aria-hidden": "true" }, ["Browse ", "→"])
      ]);
      host.appendChild(card);
      App.countUp(countEl, role.length);
    });
  }

  /* ------------------------------------------------------------ lists */
  function byCityThenEmployer(a, b) {
    var ca = JW.isTargetCity(a.location) ? 0 : 1, cb = JW.isTargetCity(b.location) ? 0 : 1;
    if (ca !== cb) return ca - cb;
    var ea = (a.employer || "").toLowerCase(), eb = (b.employer || "").toLowerCase();
    if (ea !== eb) return ea < eb ? -1 : 1;
    return (a.title || "") < (b.title || "") ? -1 : 1;
  }

  function setupList(key, rows, lastDate, emptyAll) {
    var state = { scope: "role", cities: false };
    var tools = document.getElementById(key + "-tools");
    var ul = document.getElementById(key + "-list");
    rows = rows.slice().sort(byCityThenEmployer);
    var roleCount = rows.filter(function (r) { return r.inRole; }).length;

    var chip = h("button", { type: "button", class: "chip-toggle", "aria-pressed": "false" }, [
      h("span", { class: "dots", "aria-hidden": "true" }, [h("i"), h("i"), h("i")]), "My cities only"
    ]);
    chip.addEventListener("click", function () {
      state.cities = !state.cities;
      chip.setAttribute("aria-pressed", String(state.cities));
      draw();
    });
    tools.textContent = "";
    tools.appendChild(App.segmented(key + "-scope", "Which postings to list", [
      { value: "role", label: ROLE, count: roleCount },
      { value: "all", label: "All", count: rows.length }
    ], "role", function (v) { state.scope = v; draw(); }));
    tools.appendChild(chip);

    function draw() {
      var items = rows.filter(function (r) {
        return (state.scope === "all" || r.inRole) && (!state.cities || JW.isTargetCity(r.location));
      });
      var empty = !rows.length ? App.emptyState("calm", emptyAll[0], emptyAll[1]) :
        App.emptyState("search", "Nothing for this view", state.scope === "role" ? "Switch to All to see " + App.plural(rows.length, "posting") + "." : "Try turning off My cities only.");
      App.renderList(ul, items, function (r, i) { return App.postingCard(r, { lastDate: lastDate, index: i }); }, 30, empty);
    }
    draw();
  }

  /* ------------------------------------------------------------ employer wall */
  function renderWall(recs, status) {
    var ul = document.getElementById("wall");
    ul.textContent = "";
    var m = new Map();
    function get(emp, src) {
      if (!m.has(emp)) m.set(emp, { employer: emp, source: src, role: 0, all: 0 });
      return m.get(emp);
    }
    recs.forEach(function (r) {
      var e = get(r.employer, r.source);
      if (!JW.isOpen(r)) return;
      e.all++;
      if (r.inRole) e.role++;
    });
    ((status && status.sources) || []).forEach(function (s) {
      var name = s.employer || s.name;
      var known = false;
      m.forEach(function (v) { if (v.source === s.name) known = true; });
      if (!known) get(name, s.name);
    });
    var list = Array.from(m.values()).sort(function (a, b) { return b.role - a.role || b.all - a.all || (a.employer < b.employer ? -1 : 1); });
    var max = list.length ? Math.max(1, list[0].role) : 1;
    if (!list.length) { ul.appendChild(App.emptyState("calm", "No employers yet", "They appear once the first run has finished.")); return; }
    list.forEach(function (e, i) {
      var name = App.oneLine(e.employer) || e.source;
      ul.appendChild(h("li", null, h("a", {
        href: "browse.html?employer=" + encodeURIComponent(e.employer),
        "aria-label": name + ": " + App.fmt(e.role) + " open accounting and finance postings, " + App.fmt(e.all) + " open in total. Browse them."
      }, [
        App.logo(e.source, name, "lg"),
        h("span", { class: "wall-name", text: name }),
        h("span", { class: "wall-count" }, [h("strong", { text: App.fmt(e.role) }), h("span", { text: "of " + App.fmt(e.all) + " open" })]),
        h("span", { class: "wall-bar", "aria-hidden": "true" }, h("i", { style: "width:" + (e.role / max * 100).toFixed(1) + "%;animation-delay:" + Math.min(i, 20) * 30 + "ms" }))
      ])));
    });
  }

  /* ------------------------------------------------------------ sources */
  function renderSources(status) {
    var ul = document.getElementById("sources"), errs = document.getElementById("src-errors");
    ul.textContent = ""; errs.textContent = "";
    var list = (status && Array.isArray(status.sources)) ? status.sources : [];
    if (!list.length) { ul.appendChild(App.emptyState("calm", "No source results yet", "status.json has no sources list.")); return; }
    var ok = list.filter(function (s) { return s.ok === true || s.ok === "true"; });
    var summary = document.getElementById("src-summary");
    summary.textContent = "";
    summary.appendChild(h("span", null, [h("span", { class: "dot", "aria-hidden": "true", text: "✓" }), App.fmt(ok.length) + " OK"]));
    summary.appendChild(h("span", null, [h("span", { class: "dot fail", "aria-hidden": "true", text: "✕" }), App.fmt(list.length - ok.length) + " failed"]));
    App.setText("src-sub", ok.length + " of " + list.length + " job boards answered on the latest run" +
      (ok.length < list.length ? ". A failed source writes no raw file that day, and its postings are left as they were." : "."));
    var known = { name: 1, ok: 1, count: 1, employer: 1, ats: 1, error: 1 };
    list.forEach(function (s) {
      var good = s.ok === true || s.ok === "true";
      var name = App.oneLine(s.employer || s.name);
      var extra = Object.keys(s).filter(function (k) { return !known[k] && s[k] != null && s[k] !== "" && typeof s[k] !== "object"; })
        .map(function (k) { return k.replace(/_/g, " ") + ": " + s[k]; });
      var title = name + " (" + s.name + ")" + (s.ats ? " · " + s.ats : "") + " · " + (good ? "OK" : "Failed") + " · " + (s.count == null ? "–" : s.count) + " postings" +
        (extra.length ? " · " + extra.join(" · ") : "") + (!good && s.error ? " · " + s.error : "");
      ul.appendChild(h("li", { class: "src-chip" + (good ? "" : " is-failed"), title: title }, [
        App.logo(s.name, name, "sm"),
        h("span", { class: "src-name", text: name }),
        s.ats ? h("span", { class: "src-ats", text: String(s.ats) }) : null,
        h("span", { class: "src-count", text: s.count == null ? "–" : App.fmt(+s.count) }),
        h("span", { class: "dot" + (good ? "" : " fail"), "aria-hidden": "true", text: good ? "✓" : "✕" }),
        h("span", { class: "sr-only", text: (good ? "OK, " : "Failed, ") + (s.count == null ? "no" : s.count) + " postings" + (extra.length ? ", " + extra.join(", ") : "") })
      ]));
      if (!good) errs.appendChild(h("li", null, [h("strong", { text: name + ": " }), String(s.error || "failed with no error message")]));
    });
  }

  /* ------------------------------------------------------------ boot */
  App.loadData().then(function (d) {
    var st = d.status || {};
    var rt = App.fmtRunTime(st.run_time);
    var runEl = document.getElementById("run-time");
    runEl.textContent = st.run_time ? rt.utc : "not yet";
    if (st.run_time) runEl.setAttribute("datetime", st.run_time);
    App.setText("run-ago", rt.ago ? "· " + rt.ago : "");
    App.setText("run-local", rt.local ? "Your time: " + rt.local + (st.first_run_date ? " · Watching since " + App.fmtDate(st.first_run_date) : "") : "");

    App.countUp(document.getElementById("s-days"), st.days_with_success);
    App.countUp(document.getElementById("s-open"), st.open);
    App.countUp(document.getElementById("s-new"), st.new_today);
    App.countUp(document.getElementById("s-removed"), st.removed_today);

    var recs = d.records, last = d.lastDate;
    var openRole = recs.filter(function (r) { return JW.isOpen(r) && r.inRole; });
    var openRoleCity = openRole.filter(function (r) { return JW.isTargetCity(r.location); }).length;
    if (st.first_run_date) App.setText("s-days-note", "since " + App.fmtDate(st.first_run_date));
    if (recs.length) App.setText("s-open-note", App.fmt(openRole.length) + " accounting & finance · " + App.fmt(openRoleCity) + " in my cities");

    var newRows = JW.newOn(recs, last), remRows = JW.removedOn(recs, last);
    App.setText("s-new-note", App.fmt(newRows.filter(function (r) { return r.inRole; }).length) + " accounting & finance");
    App.setText("s-removed-note", App.fmt(remRows.filter(function (r) { return r.inRole; }).length) + " accounting & finance");
    if (last) {
      App.setText("new-h", "New on " + App.fmtDate(last));
      App.setText("removed-h", "Removed on " + App.fmtDate(last));
    }
    renderCities(recs);
    var firstDay = st.first_run_date && st.first_run_date === last;
    setupList("new", newRows, last, firstDay ?
      ["Day one - nothing is new yet", "Every posting on the first run was already open when watching began, so none count as new. New postings show up here from the next run."] :
      ["No new postings in the latest run", "The boards listed nothing they hadn't listed before."]);
    setupList("removed", remRows, last, firstDay ?
      ["Day one - nothing removed yet", "A posting is removed when its board answers but no longer lists it. That needs at least two runs to compare."] :
      ["No postings were removed in the latest run", "Every posting seen before is still listed."]);
    renderWall(recs, d.status);
    renderSources(d.status);
    App.revealAll();
  });
})();
