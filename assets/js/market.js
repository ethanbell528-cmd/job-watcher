/* market.js - the Market page. Every number comes from core.js metric functions. */
(function () {
  "use strict";
  var JW = window.JW, App = window.App, Charts = window.Charts, h = App.h;
  var fmt = App.fmt, plural = App.plural;
  var C1 = "var(--series-1)", C2 = "var(--series-2)", C3 = "var(--series-3)";

  function $(id) { return document.getElementById(id); }
  function set(n, heading, para) {
    $("m" + n + "-h").textContent = heading;
    var p = $("m" + n + "-p");
    p.textContent = "";
    (Array.isArray(para) ? para : [para]).forEach(function (x) { p.appendChild(typeof x === "string" ? document.createTextNode(x) : x); });
  }
  function emptyChart(n, msg) {
    var host = $("m" + n + "-c");
    host.textContent = "";
    host.appendChild(h("div", { class: "chart-empty", text: msg }));
  }
  function table(n, caption, headers, rows) {
    var host = $("m" + n + "-t");
    host.textContent = "";
    if (rows.length) host.appendChild(Charts.tableView(caption, headers, rows));
  }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function peak(dates, values) {
    var bi = -1;
    values.forEach(function (v, i) { if (bi === -1 || v > values[bi]) bi = i; });
    return bi === -1 ? null : { date: dates[bi], value: values[bi], index: bi };
  }
  function dayWord(n) { return n === 1 ? "day" : "days"; }
  function numFmt(x) { return Number.isInteger(x) ? fmt(x) : x.toFixed(1); }

  /* 1. New postings per day */
  function sectionNew(recs, last) {
    var d = JW.newPerDay(recs, last);
    var total = sum(d.all), role = sum(d.role);
    var firstRunN = recs.filter(function (r) { return r.firstRun; }).length;
    if (!total) {
      set(1, "No new postings yet - all " + fmt(firstRunN) + " postings so far were already open when watching began",
        "A posting counts as new on the day it is first seen, except first-run postings, which were already listed the first time the watcher read their source. New postings will appear here from the second run of each source on.");
    } else {
      var pk = peak(d.dates, d.all);
      var lastIdx = d.dates.length - 1;
      set(1, fmt(total) + " new postings since watching began, peaking at " + fmt(pk.value) + " on " + App.fmtDate(pk.date),
        "Each column counts postings first seen that day, leaving out the " + fmt(firstRunN) + " first-run postings that were already open when the watcher started on their source. " +
        fmt(role) + " of the new postings (" + App.pct(role / total) + ") are in my role (consulting and analyst titles). The latest run (" +
        App.fmtDate(d.dates[lastIdx]) + ") added " + plural(d.all[lastIdx], "new posting") + ", " + fmt(d.role[lastIdx]) + " in my role.");
    }
    if (!d.dates.length) { emptyChart(1, "No history yet."); return; }
    Charts.columns($("m1-c"), {
      labels: d.dates.map(App.fmtShortDate), tipLabels: d.dates.map(App.fmtDate),
      series: [{ name: "All postings", values: d.all, color: C1 }, { name: "My role", values: d.role, color: C2 }],
      ariaLabel: "Column chart of new postings per day, all postings and my role"
    });
    table(1, "New postings per day", ["Date", "All postings", "My role"], d.dates.map(function (x, i) { return [x, d.all[i], d.role[i]]; }));
  }

  /* 2. Removed postings per day */
  function sectionRemoved(recs, last) {
    var d = JW.removedPerDay(recs, last);
    var total = sum(d.all), role = sum(d.role);
    if (!total) {
      set(2, "No postings have been removed yet",
        "A posting is removed on the first run where its source answered but no longer listed it. Removals show up once the watcher has at least two runs of a source to compare.");
    } else {
      var pk = peak(d.dates, d.all);
      var lastIdx = d.dates.length - 1;
      set(2, fmt(total) + " postings removed so far, the most on " + App.fmtDate(pk.date) + " (" + fmt(pk.value) + ")",
        "Each column counts postings whose removed date is that day (first-run postings included, since their removal date is known). " +
        fmt(role) + " of the removals (" + App.pct(role / total) + ") were in my role. The latest run removed " + plural(d.all[lastIdx], "posting") +
        ". A posting that is listed again re-opens and drops out of this count.");
    }
    if (!d.dates.length) { emptyChart(2, "No history yet."); return; }
    Charts.columns($("m2-c"), {
      labels: d.dates.map(App.fmtShortDate), tipLabels: d.dates.map(App.fmtDate),
      series: [{ name: "All postings", values: d.all, color: C1 }, { name: "My role", values: d.role, color: C2 }],
      ariaLabel: "Column chart of removed postings per day, all postings and my role"
    });
    table(2, "Removed postings per day", ["Date", "All postings", "My role"], d.dates.map(function (x, i) { return [x, d.all[i], d.role[i]]; }));
  }

  /* 3. Open postings per employer */
  function sectionEmployers(recs) {
    var rows = JW.openByEmployer(recs);
    var openTotal = sum(rows.map(function (r) { return r.count; }));
    if (!rows.length) {
      set(3, "No open postings as of the last run", "Once a source returns postings they are counted here by employer.");
      emptyChart(3, "Nothing open yet.");
      return;
    }
    var roleMap = JW.countBy(recs.filter(function (r) { return JW.isOpen(r) && r.inRole; }), function (r) { return r.employer; });
    var roleTop = JW.sortedCounts(roleMap)[0];
    var top = rows[0];
    var ties = rows.filter(function (r) { return r.count === top.count; });
    var head = ties.length > 1 ?
      ties.map(function (t) { return App.oneLine(t.key); }).join(" and ") + " tie for the most open postings (" + fmt(top.count) + " each)" :
      App.oneLine(top.key) + " has the most open postings (" + fmt(top.count) + ")";
    set(3, head,
      fmt(openTotal) + " postings were open across " + plural(rows.length, "employer") + " as of the last run; " + App.oneLine(top.key) +
      " alone holds " + App.pct(top.count / openTotal) + " of them. " +
      (roleTop ? "Counting only my role, " + App.oneLine(roleTop.key) + " leads with " + fmt(roleTop.count) + " open postings." : "None of the open postings are in my role yet."));
    var src = App.employerSources(recs);
    Charts.hbars($("m3-c"), rows.map(function (r) {
      var rc = roleMap.get(r.key) || 0;
      return { label: App.oneLine(r.key) || "(no employer)", value: r.count, source: src.get(r.key), employer: r.key,
               extraTip: [["In my role", fmt(rc), C2]] };
    }), { logos: true, color: C1, seriesName: "Open postings" });
    table(3, "Open postings per employer", ["Employer", "Open postings", "In my role"], rows.map(function (r) { return [App.oneLine(r.key), r.count, roleMap.get(r.key) || 0]; }));
  }

  /* 4. Days open (median) */
  function sectionDaysOpen(recs) {
    var st = JW.daysOpenStats(recs);
    if (!st.n) {
      set(4, "Median days open: not available yet",
        "This measure uses removed postings that are not first-run postings (removed date minus first-seen date). None have been removed yet, so there is no median to report. It fills in as postings first seen after watching began come down.");
      emptyChart(4, "Not available yet - no non-first-run postings have been removed.");
      $("m4-t").textContent = "";
      return;
    }
    var med = st.median;
    var within = st.values.filter(function (v) { return v <= med; }).length;
    set(4, "Postings stay up a median of " + numFmt(med) + " " + dayWord(med),
      "Across " + plural(st.n, "removed posting") + " that were first seen after watching began, the days from first seen to removed range from " +
      fmt(st.min) + " to " + fmt(st.max) + " " + dayWord(st.max) + ", with a median of " + numFmt(med) + ". " +
      "First-run postings are left out because their start date is unknown. Postings still open are not counted, so as the history grows and longer-running postings close, the median can rise.");
    var labels = st.histogram.map(function (_, i) { return String(i); });
    Charts.columns($("m4-c"), {
      labels: labels, tipLabels: labels.map(function (l) { return l + " " + dayWord(+l) + " open"; }),
      series: [{ name: "Removed postings", values: st.histogram, color: C1 }],
      markIndex: Number.isInteger(med) ? med : null,
      ariaLabel: "Histogram of days open for removed postings; median " + numFmt(med)
    });
    $("m4-c").appendChild(h("p", { class: "chart-caption", text: "Days open (removed date minus first-seen date). " + (Number.isInteger(med) ? "The outlined column holds the median." : "The median falls between two columns.") }));
    table(4, "Removed postings by days open", ["Days open", "Removed postings"], st.histogram.map(function (v, i) { return [i, v]; }).filter(function (r) { return r[1]; }));
  }

  /* 5. Share removed within seven days */
  function sectionShare7(recs, last) {
    var s = JW.shareRemovedWithin7(recs, last);
    if (!s.eligible) {
      set(5, "Share removed within seven days: not available yet",
        "This share looks at postings that are not first-run postings and were first seen at least seven days before the last run" +
        (s.cutoff ? " (on or before " + App.fmtDate(s.cutoff) + ")" : "") +
        ". None qualify yet, so there is nothing to report. The first postings become eligible a week after the watcher's second run.");
      emptyChart(5, "Nothing eligible yet.");
      $("m5-t").textContent = "";
      return;
    }
    set(5, App.pct(s.share) + " of postings were removed within seven days (" + fmt(s.within) + " of " + fmt(s.eligible) + ")",
      "Among " + plural(s.eligible, "posting") + " first seen on or before " + App.fmtDate(s.cutoff) + " (at least seven days before the last run) that were not already open when watching began, " +
      fmt(s.within) + " had a removed date seven days or less after their first-seen date. Of the rest, " + fmt(s.removedLater) + " came down later and " +
      fmt(s.stillOpen) + " are still open.");
    Charts.segmentedBar($("m5-c"), [
      { label: "Removed within 7 days", value: s.within, color: C1 },
      { label: "Removed after 7 days", value: s.removedLater, color: C2 },
      { label: "Still open", value: s.stillOpen, color: C3, ink: "#0b0b0b" }
    ], { caption: "Each block is a share of the " + fmt(s.eligible) + " eligible postings." });
    table(5, "Eligible postings by outcome", ["Outcome", "Postings", "Share"], [
      ["Removed within 7 days", s.within, App.pct(s.within / s.eligible)],
      ["Removed after 7 days", s.removedLater, App.pct(s.removedLater / s.eligible)],
      ["Still open", s.stillOpen, App.pct(s.stillOpen / s.eligible)],
      ["Eligible total", s.eligible, "100.0%"]
    ]);
  }

  /* 6. Top locations among open postings */
  function sectionLocations(recs) {
    var rows = JW.topLocations(recs);
    if (!rows.length) {
      set(6, "No open postings to place on the map yet", "Locations are counted once sources return open postings.");
      emptyChart(6, "Nothing open yet.");
      return;
    }
    var total = sum(rows.map(function (r) { return r.count; }));
    var name = function (k) { return App.oneLine(k) || "(no location listed)"; };
    var top = rows[0];
    var city = JW.openByTargetCity(recs);
    var TOPN = 12;
    set(6, name(top.key) + " is the top location with " + fmt(top.count) + " open postings",
      "Open postings are grouped by the location text each employer lists, across " + plural(rows.length, "distinct location") + ". The top " +
      Math.min(TOPN, rows.length) + " hold " + App.pct(sum(rows.slice(0, TOPN).map(function (r) { return r.count; })) / total) + " of the " + fmt(total) +
      " open postings. For my target cities (matched on the location text, a posting can list several): New York City " + fmt(city.NYC) +
      ", Nashville " + fmt(city.Nashville) + ", Chicago " + fmt(city.Chicago) + " - " + fmt(city.any) + " postings (" + App.pct(city.any / total) + ") in at least one.");
    Charts.hbars($("m6-c"), rows.slice(0, TOPN).map(function (r) {
      return { label: name(r.key), value: r.count, highlight: JW.isTargetCity(r.key), badges: App.cityBadges(r.key) };
    }), { color: C1, seriesName: "Open postings" });
    table(6, "Open postings by location", ["Location", "Open postings"], rows.slice(0, 50).map(function (r) { return [name(r.key), r.count]; }));
  }

  App.loadData().then(function (d) {
    var recs = d.records, last = d.lastDate;
    $("as-of").textContent = last ? "last run " + App.fmtDate(last) + " · " + plural(recs.length, "posting") + " in the history" : "no data yet";
    [sectionNew, sectionRemoved, sectionEmployers, sectionDaysOpen, sectionShare7, sectionLocations].forEach(function (fn, i) {
      try { fn(recs, last); } catch (e) {
        set(i + 1, "This section could not be computed", String(e && e.message || e));
        if (window.console) console.error(e);
      }
    });
  });
})();
