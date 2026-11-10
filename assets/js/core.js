/*
 * core.js - pure calculation functions shared by every page.
 * No DOM access here, so the same file runs in the browser (window.JW)
 * and under Node (require) for testing.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JW = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ------------------------------------------------------------------ CSV */

  /**
   * RFC 4180 parser. Handles quoted fields with commas, doubled quotes ("")
   * and embedded CR/LF, CRLF or LF row endings, a UTF-8 BOM, and a missing
   * final newline. Returns an array of rows (arrays of strings).
   */
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = "";
    var n = text.length;
    var i = 0;
    var inQuotes = false;
    var fieldStarted = false; // distinguishes `""` (empty quoted) from nothing
    if (n && text.charCodeAt(0) === 0xfeff) i = 1;

    while (i < n) {
      if (inQuotes) {
        var q = text.indexOf('"', i);
        if (q === -1) { field += text.slice(i); i = n; break; } // unterminated: take rest
        field += text.slice(i, q);
        if (text.charCodeAt(q + 1) === 34) { field += '"'; i = q + 2; }
        else { inQuotes = false; i = q + 1; }
        continue;
      }
      var c = text.charCodeAt(i);
      if (c === 34) { inQuotes = true; fieldStarted = true; i++; }
      else if (c === 44) { row.push(field); field = ""; fieldStarted = false; i++; }
      else if (c === 10 || c === 13) {
        row.push(field); rows.push(row);
        row = []; field = ""; fieldStarted = false;
        i += (c === 13 && text.charCodeAt(i + 1) === 10) ? 2 : 1;
      } else {
        var j = i + 1;
        while (j < n) {
          var d = text.charCodeAt(j);
          if (d === 44 || d === 10 || d === 13 || d === 34) break;
          j++;
        }
        field += text.slice(i, j); fieldStarted = true; i = j;
      }
    }
    if (fieldStarted || field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function toBool(v) {
    var s = String(v == null ? "" : v).trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "t";
  }

  /** Parse history.csv text into posting objects (all original columns kept as strings). */
  function parseHistory(text) {
    var rows = parseCSV(text);
    if (!rows.length) return [];
    var header = rows[0].map(function (h) { return h.trim(); });
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      if (row.length === 1 && row[0] === "") continue; // blank line
      var o = {};
      for (var k = 0; k < header.length; k++) o[header[k]] = row[k] == null ? "" : row[k];
      o.first_seen = (o.first_seen || "").trim();
      o.last_seen = (o.last_seen || "").trim();
      o.removed_date = (o.removed_date || "").trim();
      o.status = (o.status || "").trim().toLowerCase();
      o.inRole = toBool(o.in_role);
      o.firstRun = toBool(o.first_run);
      out.push(o);
    }
    return out;
  }

  /* ---------------------------------------------------------------- dates */

  var DAY_MS = 86400000;

  /** "YYYY-MM-DD" -> integer day number (days since epoch, UTC). NaN if invalid. */
  function dayNum(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
    if (!m) return NaN;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
  }

  function dayStr(n) {
    return new Date(n * DAY_MS).toISOString().slice(0, 10);
  }

  /** b - a in whole days. */
  function daysBetween(a, b) { return dayNum(b) - dayNum(a); }

  /** Parse an ISO timestamp as UTC even if it carries no zone designator. */
  function parseUTC(iso) {
    if (!iso) return null;
    var s = String(iso).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00Z";
    else if (/T\d/.test(s) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s += "Z";
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  /** UTC calendar date (YYYY-MM-DD) of an ISO timestamp. */
  function utcDate(iso) {
    var d = parseUTC(iso);
    return d ? d.toISOString().slice(0, 10) : "";
  }

  function maxDate(records, field) {
    var best = "";
    for (var i = 0; i < records.length; i++) {
      var v = records[i][field];
      if (v && v > best) best = v;
    }
    return best;
  }

  function minDate(records, field) {
    var best = "";
    for (var i = 0; i < records.length; i++) {
      var v = records[i][field];
      if (v && (!best || v < best)) best = v;
    }
    return best;
  }

  /** Date of the last run: UTC date of status.run_time, else the latest last_seen. */
  function lastRunDate(status, records) {
    var d = status && status.run_time ? utcDate(status.run_time) : "";
    return d || maxDate(records || [], "last_seen");
  }

  /** Inclusive list of YYYY-MM-DD strings from a to b. */
  function dateRange(a, b) {
    var out = [];
    var s = dayNum(a), e = dayNum(b);
    if (isNaN(s) || isNaN(e)) return out;
    for (var d = s; d <= e; d++) out.push(dayStr(d));
    return out;
  }

  /* ------------------------------------------------------------ predicates */

  function isOpen(r) { return r.status === "open"; }
  function isRemoved(r) { return r.status === "removed" && r.removed_date !== ""; }

  /**
   * Days a posting has been open as of the last run: lastDate - first_seen.
   * For first-run postings the start is unknown, so the value is a lower bound
   * (atLeast = true, shown as "N+").
   */
  function daysOpen(r, lastDate) {
    var d = daysBetween(r.first_seen, lastDate);
    return { days: isNaN(d) ? null : d, atLeast: !!r.firstRun };
  }

  function daysOpenLabel(r, lastDate) {
    var d = daysOpen(r, lastDate);
    if (d.days == null) return "?";
    return d.days + (d.atLeast ? "+" : "") + (d.days === 1 && !d.atLeast ? " day" : " days");
  }

  /* ---------------------------------------------------------- city rules */

  var CITY_RULES = [
    { key: "NYC", label: "New York City",
      re: /\b(new\s*york(\s*city)?|nyc|manhattan|brooklyn|queens|bronx|staten\s+island)\b/i },
    { key: "Nashville", label: "Nashville",
      re: /\bnashville\b|\b(franklin|brentwood)\s*,\s*(tn|tennessee)\b/i },
    { key: "Chicago", label: "Chicago", re: /\bchicago\b/i }
  ];

  /** Return the target cities a location string mentions, e.g. ["NYC", "Chicago"]. */
  function classifyCity(loc) {
    var out = [];
    if (!loc) return out;
    for (var i = 0; i < CITY_RULES.length; i++) {
      if (CITY_RULES[i].re.test(loc)) out.push(CITY_RULES[i].key);
    }
    return out;
  }

  function isTargetCity(loc) { return classifyCity(loc).length > 0; }

  /* ------------------------------------------------------------ grouping */

  function countBy(records, keyFn) {
    var map = new Map();
    for (var i = 0; i < records.length; i++) {
      var k = keyFn(records[i]);
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }

  /** Map -> [{key, count}] sorted by count desc, then key asc. */
  function sortedCounts(map) {
    var arr = [];
    map.forEach(function (v, k) { arr.push({ key: k, count: v }); });
    arr.sort(function (a, b) { return b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0); });
    return arr;
  }

  function median(values) {
    if (!values.length) return null;
    var s = values.slice().sort(function (a, b) { return a - b; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* -------------------------------------------------------- market metrics */

  /** First day of the history (earliest first_seen), used as the x-axis start. */
  function historyStart(records) { return minDate(records, "first_seen"); }

  /**
   * 1. New postings per day: postings whose first_seen is that day, leaving
   *    out first_run postings. Returned for all postings and for in-role ones.
   */
  function newPerDay(records, lastDate) {
    var start = historyStart(records);
    var dates = dateRange(start, lastDate || maxDate(records, "last_seen"));
    var idx = new Map(dates.map(function (d, i) { return [d, i]; }));
    var all = dates.map(function () { return 0; });
    var role = dates.map(function () { return 0; });
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.firstRun) continue;
      var k = idx.get(r.first_seen);
      if (k === undefined) continue;
      all[k]++;
      if (r.inRole) role[k]++;
    }
    return { dates: dates, all: all, role: role };
  }

  /** 2. Removed postings per day: postings with a removed_date on that day. */
  function removedPerDay(records, lastDate) {
    var start = historyStart(records);
    var dates = dateRange(start, lastDate || maxDate(records, "last_seen"));
    var idx = new Map(dates.map(function (d, i) { return [d, i]; }));
    var all = dates.map(function () { return 0; });
    var role = dates.map(function () { return 0; });
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r.removed_date) continue;
      var k = idx.get(r.removed_date);
      if (k === undefined) continue;
      all[k]++;
      if (r.inRole) role[k]++;
    }
    return { dates: dates, all: all, role: role };
  }

  /** 3. Open postings per employer as of the last run (status == open). */
  function openByEmployer(records) {
    return sortedCounts(countBy(records.filter(isOpen), function (r) { return r.employer; }));
  }

  /**
   * 4. Days open: for removed postings that are not first-run postings,
   *    removed_date - first_seen. Reports the median.
   */
  function daysOpenStats(records) {
    var values = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.firstRun || !isRemoved(r)) continue;
      var d = daysBetween(r.first_seen, r.removed_date);
      if (!isNaN(d)) values.push(d);
    }
    values.sort(function (a, b) { return a - b; });
    var hist = [];
    if (values.length) {
      var max = values[values.length - 1];
      for (var k = 0; k <= max; k++) hist.push(0);
      values.forEach(function (v) { hist[v]++; });
    }
    return { n: values.length, median: median(values), values: values, histogram: hist,
             min: values.length ? values[0] : null, max: values.length ? values[values.length - 1] : null };
  }

  /**
   * 5. Share removed within seven days: among non-first-run postings first seen
   *    at least 7 days before the last run, the share with
   *    removed_date - first_seen <= 7.
   */
  function shareRemovedWithin7(records, lastDate) {
    var eligible = 0, within = 0, later = 0, stillOpen = 0;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.firstRun) continue;
      var age = daysBetween(r.first_seen, lastDate);
      if (isNaN(age) || age < 7) continue;
      eligible++;
      if (r.removed_date) {
        var d = daysBetween(r.first_seen, r.removed_date);
        if (d <= 7) within++; else later++;
      } else {
        stillOpen++;
      }
    }
    var cutoff = isNaN(dayNum(lastDate)) ? "" : dayStr(dayNum(lastDate) - 7);
    return { eligible: eligible, within: within, removedLater: later, stillOpen: stillOpen,
             share: eligible ? within / eligible : null, cutoff: cutoff };
  }

  /** 6. Top locations among open postings (exact location string; empty grouped as ""). */
  function topLocations(records) {
    return sortedCounts(countBy(records.filter(isOpen), function (r) { return r.location; }));
  }

  /** Open postings split by target city (a posting can count for several). */
  function openByTargetCity(records) {
    var out = { NYC: 0, Nashville: 0, Chicago: 0, any: 0 };
    records.forEach(function (r) {
      if (!isOpen(r)) return;
      var c = classifyCity(r.location);
      c.forEach(function (k) { out[k]++; });
      if (c.length) out.any++;
    });
    return out;
  }

  /* ------------------------------------------------------- today's lists */

  function newOn(records, date) {
    return records.filter(function (r) { return r.first_seen === date && !r.firstRun; });
  }
  function removedOn(records, date) {
    return records.filter(function (r) { return r.removed_date === date; });
  }

  /* ------------------------------------------------------------ browse */

  /**
   * Filter + sort the browse list.
   * opts: { scope: "role"|"all", employer, location ("" | "city:any" | "city:NYC" | "loc:<exact>"),
   *         age ("" | "le:N" | "gt:N" | "firstrun"), q, sort ("asc"|"desc"),
   *         shortlistOnly, shortlist (Set), lastDate }
   */
  function filterPostings(records, opts) {
    var q = (opts.q || "").trim().toLowerCase();
    var terms = q ? q.split(/\s+/) : [];
    var loc = opts.location || "";
    var age = opts.age || "";
    var ageOp = "", ageN = 0;
    if (age === "firstrun") ageOp = "fr";
    else if (age) { var p = age.split(":"); ageOp = p[0]; ageN = +p[1]; }
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (opts.shortlistOnly) {
        if (!opts.shortlist || !opts.shortlist.has(r.posting_id)) continue;
      } else if (!isOpen(r)) continue;
      if (opts.scope !== "all" && !r.inRole) continue;
      if (opts.employer && r.employer !== opts.employer) continue;
      if (loc) {
        if (loc.indexOf("city:") === 0) {
          var cities = classifyCity(r.location), want = loc.slice(5);
          if (want === "any" ? !cities.length : cities.indexOf(want) === -1) continue;
        } else if (loc.indexOf("loc:") === 0 && r.location !== loc.slice(4)) continue;
      }
      if (ageOp) {
        var d = daysBetween(r.first_seen, opts.lastDate);
        if (ageOp === "fr") { if (!r.firstRun) continue; }
        else if (ageOp === "le") { if (r.firstRun || !(d <= ageN)) continue; } // first-run start unknown
        else if (ageOp === "gt") { if (!(d > ageN)) continue; }              // N+ > limit is certain
      }
      if (terms.length) {
        var t = (r.title || "").toLowerCase(), ok = true;
        for (var k = 0; k < terms.length; k++) if (t.indexOf(terms[k]) === -1) { ok = false; break; }
        if (!ok) continue;
      }
      out.push(r);
    }
    var dir = opts.sort === "asc" ? 1 : -1;
    out.sort(function (a, b) {
      if (a.first_seen !== b.first_seen) return a.first_seen < b.first_seen ? -dir : dir;
      return a.posting_id < b.posting_id ? -1 : a.posting_id > b.posting_id ? 1 : 0;
    });
    return out;
  }

  return {
    parseCSV: parseCSV, parseHistory: parseHistory, toBool: toBool,
    dayNum: dayNum, dayStr: dayStr, daysBetween: daysBetween, parseUTC: parseUTC, utcDate: utcDate,
    lastRunDate: lastRunDate, dateRange: dateRange, minDate: minDate, maxDate: maxDate,
    isOpen: isOpen, isRemoved: isRemoved, daysOpen: daysOpen, daysOpenLabel: daysOpenLabel,
    CITY_RULES: CITY_RULES, classifyCity: classifyCity, isTargetCity: isTargetCity,
    countBy: countBy, sortedCounts: sortedCounts, median: median,
    newPerDay: newPerDay, removedPerDay: removedPerDay, openByEmployer: openByEmployer,
    daysOpenStats: daysOpenStats, shareRemovedWithin7: shareRemovedWithin7,
    topLocations: topLocations, openByTargetCity: openByTargetCity,
    newOn: newOn, removedOn: removedOn, filterPostings: filterPostings
  };
});
