/* today.js - the Today page (index.html). */
(function () {
  "use strict";
  var JW = window.JW, App = window.App, h = App.h;

  function byCityThenEmployer(a, b) {
    var ca = JW.isTargetCity(a.location) ? 0 : 1, cb = JW.isTargetCity(b.location) ? 0 : 1;
    if (ca !== cb) return ca - cb;
    var ea = (a.employer || "").toLowerCase(), eb = (b.employer || "").toLowerCase();
    if (ea !== eb) return ea < eb ? -1 : 1;
    return (a.title || "") < (b.title || "") ? -1 : 1;
  }

  /** A list with a "My role / All" switch and a "My cities only" chip. */
  function setupList(key, rows, lastDate, emptyAll) {
    var state = { scope: "role", cities: false };
    var tools = document.getElementById(key + "-tools");
    var ul = document.getElementById(key + "-list");
    rows = rows.slice().sort(byCityThenEmployer);
    var roleCount = rows.filter(function (r) { return r.inRole; }).length;

    var chip = h("button", { type: "button", class: "chip-toggle", "aria-pressed": "false" }, [
      h("span", { class: "pin", "aria-hidden": "true" }), "My cities only"
    ]);
    chip.addEventListener("click", function () {
      state.cities = !state.cities;
      chip.setAttribute("aria-pressed", String(state.cities));
      draw();
    });
    tools.textContent = "";
    tools.appendChild(App.segmented(key + "-scope", "Which postings to list", [
      { value: "role", label: "My role", count: roleCount },
      { value: "all", label: "All", count: rows.length }
    ], "role", function (v) { state.scope = v; draw(); }));
    tools.appendChild(chip);

    function draw() {
      var items = rows.filter(function (r) {
        return (state.scope === "all" || r.inRole) && (!state.cities || JW.isTargetCity(r.location));
      });
      var empty = !rows.length ? emptyAll :
        "None for this view" + (state.scope === "role" ? " - switch to All to see " + App.plural(rows.length, "posting") + "." : ".");
      App.renderList(ul, items, function (r) { return App.postingCard(r, { lastDate: lastDate }); }, 40, empty);
    }
    draw();
  }

  function renderSources(status) {
    var ul = document.getElementById("sources");
    ul.textContent = "";
    var list = (status && Array.isArray(status.sources)) ? status.sources : [];
    if (!list.length) { ul.appendChild(h("li", { class: "empty", text: "No source results in status.json yet." })); return; }
    var okCount = list.filter(function (s) { return s.ok === true || s.ok === "true"; }).length;
    App.setText("src-sub", okCount + " of " + list.length + " sources answered on the latest run" +
      (okCount < list.length ? " - a failed source writes no raw file that day, and its postings are left as they were." : "."));
    var known = { name: 1, ok: 1, count: 1, employer: 1, ats: 1, error: 1 };
    list.forEach(function (src) {
      var ok = src.ok === true || src.ok === "true";
      var extras = [];
      if (src.ats) extras.push(h("span", { class: "chip", text: String(src.ats) }));
      Object.keys(src).forEach(function (k) {
        if (known[k] || src[k] == null || src[k] === "" || typeof src[k] === "object") return;
        extras.push(h("span", { class: "chip chip-muted", text: k.replace(/_/g, " ") + ": " + src[k] }));
      });
      ul.appendChild(h("li", { class: "source card" + (ok ? "" : " is-failed") }, [
        App.logo(src.name, src.employer || src.name, "lg"),
        h("div", { class: "source-main" }, [
          h("h3", { class: "source-name", text: src.employer || src.name }),
          src.employer ? h("span", { class: "source-id", text: src.name }) : null,
          extras.length ? h("div", { class: "posting-meta" }, extras) : null,
          !ok && src.error ? h("p", { class: "source-error", text: String(src.error) }) : null
        ]),
        h("div", { class: "source-side" }, [
          h("span", { class: "status-tag " + (ok ? "status-ok" : "status-fail") }, [
            h("span", { class: "status-icon", "aria-hidden": "true", text: ok ? "✓" : "✕" }), ok ? "OK" : "Failed"
          ]),
          h("span", { class: "source-count" }, [h("strong", { text: src.count == null ? "–" : App.fmt(+src.count) }), " postings"])
        ])
      ]));
    });
  }

  App.loadData().then(function (d) {
    var st = d.status || {};
    var rt = App.fmtRunTime(st.run_time);
    var runEl = document.getElementById("run-time");
    runEl.textContent = st.run_time ? rt.utc : "not yet";
    if (st.run_time) runEl.setAttribute("datetime", st.run_time);
    App.setText("run-ago", rt.ago ? "(" + rt.ago + ")" : "");
    App.setText("run-local", rt.local ? "Your time: " + rt.local + (st.first_run_date ? " · Watching since " + App.fmtDate(st.first_run_date) : "") : "");

    App.setText("s-days", App.fmt(st.days_with_success));
    App.setText("s-open", App.fmt(st.open));
    App.setText("s-new", App.fmt(st.new_today));
    App.setText("s-removed", App.fmt(st.removed_today));

    var recs = d.records, last = d.lastDate;
    var openRole = recs.filter(function (r) { return JW.isOpen(r) && r.inRole; });
    var openRoleCity = openRole.filter(function (r) { return JW.isTargetCity(r.location); }).length;
    if (st.first_run_date) App.setText("s-days-note", "since " + App.fmtDate(st.first_run_date));
    if (recs.length) App.setText("s-open-note", App.fmt(openRole.length) + " in my role · " + App.fmt(openRoleCity) + " in my cities");

    var newRows = JW.newOn(recs, last), remRows = JW.removedOn(recs, last);
    App.setText("s-new-note", App.fmt(newRows.filter(function (r) { return r.inRole; }).length) + " in my role");
    App.setText("s-removed-note", App.fmt(remRows.filter(function (r) { return r.inRole; }).length) + " in my role");
    if (last) {
      App.setText("new-h", "New on " + App.fmtDate(last));
      App.setText("removed-h", "Removed on " + App.fmtDate(last));
    }
    var firstDay = st.first_run_date && st.first_run_date === last;
    setupList("new", newRows, last, firstDay ?
      "This is the first run - every posting was already open, so nothing counts as new yet." : "No new postings in the latest run.");
    setupList("removed", remRows, last, firstDay ?
      "This is the first run - nothing can be removed yet." : "No postings were removed in the latest run.");
    renderSources(d.status);
  });
})();
