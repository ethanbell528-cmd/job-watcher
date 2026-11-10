"""status.json counts, the issue body, and the run's exit behaviour."""

import json

from watcher import fetch, issue, run
from watcher.build import build_history
from watcher.issue import BODY_BUDGET, build_issue_body, issue_title
from watcher.status import compute_status, write_status

from test_build import put

RESULTS = [
    {"name": "a", "employer": "Acme", "ats": "ashby", "ok": True, "count": 3, "error": None},
    {"name": "b", "employer": "Beta", "ats": "lever", "ok": False, "count": 0, "error": "HTTP 503 from lever"},
]


def make_history(tmp_path):
    put(tmp_path, "2026-11-01", "a", [("1", "Financial Analyst"), ("2", "Engineer"), ("3", "Tax Consultant")])
    put(tmp_path, "2026-11-02", "a", [("1", "Financial Analyst"), ("4", "Credit Analyst"), ("5", "Designer")])
    return build_history(tmp_path / "raw")


def test_status_counts(tmp_path):
    res = make_history(tmp_path)
    s = compute_status(res.rows, res.dates, "2026-11-02T11:17:00Z", "2026-11-02", RESULTS)
    assert list(s) == ["run_time", "first_run_date", "days_with_success", "open", "new_today", "removed_today", "sources"]
    assert s["run_time"] == "2026-11-02T11:17:00Z"
    assert s["first_run_date"] == "2026-11-01"
    assert s["days_with_success"] == 2
    assert s["open"] == 3  # 1, 4, 5
    assert s["new_today"] == 2  # 4, 5
    assert s["removed_today"] == 2  # 2, 3
    assert s["sources"][0] == {"name": "a", "ok": True, "count": 3, "employer": "Acme", "ats": "ashby", "error": None}
    assert s["sources"][1]["ok"] is False and s["sources"][1]["count"] == 0
    write_status(s, tmp_path / "status.json")
    assert json.loads((tmp_path / "status.json").read_text(encoding="utf-8")) == s


def test_new_today_leaves_out_first_run(tmp_path):
    put(tmp_path, "2026-11-02", "a", [("1", "Analyst")])
    res = build_history(tmp_path / "raw")
    s = compute_status(res.rows, res.dates, "t", "2026-11-02", RESULTS)
    assert s["new_today"] == 0 and s["open"] == 1


def test_issue_body_lists_new_and_removed_with_links(tmp_path):
    res = make_history(tmp_path)
    body = build_issue_body("2026-11-02", res.rows, RESULTS)
    assert issue_title("2026-11-02") == "Job watcher 2026-11-02"
    assert "[Credit Analyst](https://jobs.ashbyhq.com/a/4)" in body
    assert "[Designer](https://jobs.ashbyhq.com/a/5)" in body
    assert "[Tax Consultant](https://jobs.ashbyhq.com/a/3)" in body
    assert "[Engineer](https://jobs.ashbyhq.com/a/2)" in body
    assert "Financial Analyst" not in body  # unchanged posting
    # in-role sections come before the others
    assert body.index("New postings in my role (1)") < body.index("Removed postings in my role (1)")
    assert body.index("Removed postings in my role (1)") < body.index("Other new postings (1)")
    assert body.index("Other new postings (1)") < body.index("Other removed postings (1)")
    assert "HTTP 503 from lever" in body and "1 failed" in body


def test_issue_body_with_no_changes(tmp_path):
    put(tmp_path, "2026-11-01", "a", [("1", "Analyst")])
    res = build_history(tmp_path / "raw")
    body = build_issue_body("2026-11-01", res.rows, RESULTS[:1])  # first run: nothing is "new"
    assert "New postings: **0**" in body and "_None._" in body


def test_issue_body_truncates_but_keeps_in_role(tmp_path):
    put(tmp_path, "2026-11-01", "a", [("0", "Seed")])
    jobs = [(f"r{i}", f"Tax Analyst {i}") for i in range(50)] + [(f"o{i}", f"Engineer {'x' * 80} {i}") for i in range(3000)]
    put(tmp_path, "2026-11-02", "a", jobs)
    res = build_history(tmp_path / "raw")
    body = build_issue_body("2026-11-02", res.rows, RESULTS)
    assert len(body) <= BODY_BUDGET <= issue.MAX_BODY
    assert all(f"[Tax Analyst {i}]" in body for i in range(50))
    assert "Other new postings (3000)" in body
    assert "more" in body.split("Other new postings (3000)")[1]


def test_issue_markdown_is_escaped():
    row = {"posting_id": "a:1", "title": "Analyst [Remote] *urgent*", "employer": "A", "location": "",
           "url": "https://x/y (1)"}
    line = issue.posting_line(row)
    assert line.startswith("- [Analyst \\[Remote\\] \\*urgent\\*](https://x/y%20(1%29)")


def test_publish_issue_skips_without_token(monkeypatch):
    monkeypatch.delenv("GH_TOKEN", raising=False)
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.setattr(issue.shutil, "which", lambda name: "gh")
    assert issue.publish_issue("2026-11-02", "body").startswith("issue skipped")


def _fake_fetch(results):
    def fake(sources, fetched_at, workers=6):
        return [dict(r) for r in results]
    return fake


def test_run_survives_failed_source_and_fails_only_when_all_fail(tmp_path, monkeypatch):
    sources = tmp_path / "sources.json"
    sources.write_text(json.dumps([
        {"name": "a", "employer": "Acme", "ats": "ashby", "token": "a", "search": ""},
        {"name": "b", "employer": "Beta", "ats": "lever", "token": "b", "search": ""},
    ]), encoding="utf-8")
    env = {"source": "a", "employer": "Acme", "ats": "ashby", "config": {"token": "a"}, "fetched_at": "t", "search": "",
           "pages": [{"jobs": [{"id": "1", "title": "Analyst", "jobUrl": "u"}]}]}
    ok = {"name": "a", "employer": "Acme", "ats": "ashby", "ok": True, "count": 1, "error": None, "seconds": 0, "envelope": env}
    bad = {"name": "b", "employer": "Beta", "ats": "lever", "ok": False, "count": 0, "error": "boom", "seconds": 0, "envelope": None}
    data = tmp_path / "data"

    monkeypatch.setattr(run, "fetch_all", _fake_fetch([ok, bad]))
    assert run.main(["--data-dir", str(data), "--sources", str(sources), "--no-issue"]) == 0
    status = json.loads((data / "status.json").read_text(encoding="utf-8"))
    assert [(s["name"], s["ok"], s["count"]) for s in status["sources"]] == [("a", True, 1), ("b", False, 0)]
    assert (data / "history.csv").exists()

    before = (data / "status.json").read_bytes()
    monkeypatch.setattr(run, "fetch_all", _fake_fetch([dict(ok, ok=False, envelope=None, error="x"), bad]))
    assert run.main(["--data-dir", str(data), "--sources", str(sources), "--no-issue"]) == 1
    assert (data / "status.json").read_bytes() == before  # nothing changed


def test_fetch_source_records_failures_without_raising(monkeypatch):
    def boom(src, session):
        raise fetch.FetchError("HTTP 404")
    monkeypatch.setitem(fetch.FETCHERS, "lever", boom)
    r = fetch.fetch_source({"name": "x", "employer": "X", "ats": "lever", "token": "x", "search": ""}, "t")
    assert r["ok"] is False and "HTTP 404" in r["error"] and r["envelope"] is None

    r = fetch.fetch_source({"name": "y", "employer": "Y", "ats": "taleo"}, "t")
    assert r["ok"] is False and "unknown ats" in r["error"]

    monkeypatch.setitem(fetch.FETCHERS, "lever", lambda src, session: [[]])
    r = fetch.fetch_source({"name": "x", "employer": "X", "ats": "lever", "token": "x", "search": ""}, "t")
    assert r["ok"] is False and "no postings" in r["error"]
