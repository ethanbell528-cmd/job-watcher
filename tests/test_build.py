"""History logic: first-seen, last-seen, removed, reopened, first_run, sorting, reproducibility."""

import csv
import gzip
import io
import json

import pytest

from watcher import raw
from watcher.build import HISTORY_COLUMNS, build, build_history


def put(data_dir, date, source, jobs, employer="Acme"):
    """Write a raw file for `source` on `date` listing `jobs` = [(id, title), ...] (Ashby shape)."""
    env = {
        "source": source,
        "employer": employer,
        "ats": "ashby",
        "config": {"name": source, "employer": employer, "ats": "ashby", "token": source, "search": ""},
        "fetched_at": f"{date}T11:17:00Z",
        "search": "",
        "pages": [{"jobs": [
            {"id": jid, "title": title, "location": "NYC", "department": "Finance",
             "publishedAt": "2026-01-01T00:00:00Z", "jobUrl": f"https://jobs.ashbyhq.com/{source}/{jid}"}
            for jid, title in jobs
        ]}],
    }
    raw.write_raw(data_dir / "raw" / date / f"{source}.json.gz", env)


def hist(data_dir):
    return {r["posting_id"]: r for r in build_history(data_dir / "raw").rows}


def test_first_seen_last_seen_and_removed(tmp_path):
    put(tmp_path, "2026-11-01", "a", [("1", "Analyst"), ("2", "Engineer")])
    put(tmp_path, "2026-11-02", "a", [("1", "Analyst"), ("3", "Consultant")])
    put(tmp_path, "2026-11-03", "a", [("1", "Analyst"), ("3", "Consultant")])
    h = hist(tmp_path)

    assert h["a:1"]["first_seen"] == "2026-11-01"
    assert h["a:1"]["last_seen"] == "2026-11-03"
    assert h["a:1"]["status"] == "open" and h["a:1"]["removed_date"] == ""

    assert h["a:2"]["first_seen"] == "2026-11-01"
    assert h["a:2"]["last_seen"] == "2026-11-01"
    assert h["a:2"]["status"] == "removed"
    assert h["a:2"]["removed_date"] == "2026-11-02"  # removed on the first day it was missing, not later

    assert h["a:3"]["first_seen"] == "2026-11-02"
    assert h["a:3"]["first_run"] is False


def test_missing_raw_file_changes_nothing(tmp_path):
    # Source "a" fails on 11-02 (no raw file): its postings must not be removed that day.
    put(tmp_path, "2026-11-01", "a", [("1", "Analyst")])
    put(tmp_path, "2026-11-01", "b", [("9", "Analyst")])
    put(tmp_path, "2026-11-02", "b", [("9", "Analyst")])
    h = hist(tmp_path)
    assert h["a:1"]["status"] == "open"
    assert h["a:1"]["last_seen"] == "2026-11-01"
    assert h["b:9"]["last_seen"] == "2026-11-02"

    # When "a" comes back without posting 1, it is removed on that later day.
    put(tmp_path, "2026-11-03", "a", [("2", "Analyst")])
    h = hist(tmp_path)
    assert h["a:1"]["status"] == "removed"
    assert h["a:1"]["removed_date"] == "2026-11-03"


def test_removed_only_affects_own_source(tmp_path):
    put(tmp_path, "2026-11-01", "a", [("1", "X")])
    put(tmp_path, "2026-11-01", "b", [("1", "X")])
    put(tmp_path, "2026-11-02", "b", [("2", "X")])
    h = hist(tmp_path)
    assert h["a:1"]["status"] == "open"
    assert h["b:1"]["status"] == "removed"


def test_reopen_clears_removed_date_and_keeps_first_seen(tmp_path):
    put(tmp_path, "2026-11-01", "a", [("1", "Analyst"), ("x", "Other")])
    put(tmp_path, "2026-11-02", "a", [("x", "Other")])
    put(tmp_path, "2026-11-03", "a", [("1", "Senior Analyst"), ("x", "Other")])
    h = hist(tmp_path)
    r = h["a:1"]
    assert r["status"] == "open"
    assert r["removed_date"] == ""
    assert r["first_seen"] == "2026-11-01"
    assert r["last_seen"] == "2026-11-03"
    assert r["title"] == "Senior Analyst"  # latest values win
    assert r["first_run"] is True


def test_first_run_is_per_source(tmp_path):
    put(tmp_path, "2026-11-01", "a", [("1", "X")])
    put(tmp_path, "2026-11-02", "a", [("1", "X"), ("2", "X")])
    put(tmp_path, "2026-11-02", "b", [("7", "X")])  # source added on day 2
    put(tmp_path, "2026-11-03", "b", [("7", "X"), ("8", "X")])
    h = hist(tmp_path)
    assert h["a:1"]["first_run"] is True
    assert h["a:2"]["first_run"] is False
    assert h["b:7"]["first_run"] is True  # its source's first raw file
    assert h["b:8"]["first_run"] is False


def test_first_run_uses_first_readable_file(tmp_path):
    put(tmp_path, "2026-11-01", "a", [("1", "X")])
    (tmp_path / "raw" / "2026-11-01" / "a.json.gz").write_bytes(b"not gzip")  # corrupt
    put(tmp_path, "2026-11-02", "a", [("1", "X")])
    res = build_history(tmp_path / "raw")
    assert res.warnings and "a.json.gz" in res.warnings[0]
    assert res.dates == ["2026-11-02"]
    r = res.rows[0]
    assert r["first_seen"] == "2026-11-02" and r["first_run"] is True


def test_corrupt_file_is_treated_as_missing(tmp_path):
    put(tmp_path, "2026-11-01", "a", [("1", "X"), ("2", "X")])
    day2 = tmp_path / "raw" / "2026-11-02"
    day2.mkdir(parents=True)
    (day2 / "a.json.gz").write_bytes(gzip.compress(b"{truncated", mtime=0))
    h = hist(tmp_path)
    assert h["a:1"]["status"] == "open" and h["a:2"]["status"] == "open"


def test_duplicate_ids_in_one_file_are_one_posting(tmp_path):
    put(tmp_path, "2026-11-01", "a", [("1", "Analyst"), ("1", "Analyst"), ("2", "X")])
    rows = build_history(tmp_path / "raw").rows
    assert [r["posting_id"] for r in rows] == ["a:1", "a:2"]


def test_underscore_files_and_other_dirs_are_ignored(tmp_path):
    put(tmp_path, "2026-11-01", "a", [("1", "X")])
    (tmp_path / "raw" / "2026-11-01" / "_run.json").write_text("{}", encoding="utf-8")
    raw.write_raw(tmp_path / "raw" / "2026-11-01" / "_skip.json.gz", {"bad": True})
    (tmp_path / "raw" / "notes").mkdir()
    rows = build_history(tmp_path / "raw").rows
    assert [r["posting_id"] for r in rows] == ["a:1"]


def test_in_role_uses_title_rule(tmp_path):
    put(tmp_path, "2026-11-01", "a", [("1", "Financial Analyst"), ("2", "Lactation Consultant"), ("3", "Engineer")])
    h = hist(tmp_path)
    assert (h["a:1"]["in_role"], h["a:2"]["in_role"], h["a:3"]["in_role"]) == (True, False, False)


def test_csv_sorted_columns_and_values(tmp_path):
    put(tmp_path, "2026-11-01", "zeta", [("2", "Analyst"), ("10", "Engineer")])
    put(tmp_path, "2026-11-01", "alpha", [("b", "Consultant, \"Strategy\"")])
    put(tmp_path, "2026-11-02", "zeta", [("2", "Analyst")])
    build(tmp_path)
    text = (tmp_path / "history.csv").read_bytes().decode("utf-8")
    assert "\r" not in text
    rows = list(csv.DictReader(io.StringIO(text)))
    assert list(rows[0].keys()) == list(HISTORY_COLUMNS)
    ids = [r["posting_id"] for r in rows]
    assert ids == sorted(ids) == ["alpha:b", "zeta:10", "zeta:2"]
    a = rows[0]
    assert a == {
        "posting_id": "alpha:b", "source": "alpha", "source_id": "b", "employer": "Acme",
        "title": 'Consultant, "Strategy"', "location": "NYC", "department": "Finance",
        "posted_date": "2026-01-01", "url": "https://jobs.ashbyhq.com/alpha/b", "in_role": "true",
        "first_run": "true", "first_seen": "2026-11-01", "last_seen": "2026-11-01", "status": "open",
        "removed_date": "",
    }
    assert rows[1]["status"] == "removed" and rows[1]["removed_date"] == "2026-11-02"
    assert rows[1]["in_role"] == "false"


def test_rebuild_is_byte_identical(tmp_path):
    put(tmp_path, "2026-11-01", "a", [("1", "Analyst"), ("2", "Ünïcode Consultant — Zürich")])
    put(tmp_path, "2026-11-02", "a", [("1", "Analyst")])
    put(tmp_path, "2026-11-02", "b", [("1", "Data Analyst, NYC")])
    build(tmp_path)
    first = (tmp_path / "history.csv").read_bytes()
    (tmp_path / "history.csv").write_text("stale", encoding="utf-8")
    build(tmp_path)
    assert (tmp_path / "history.csv").read_bytes() == first


def test_raw_files_are_deterministic(tmp_path):
    env = {"source": "a", "pages": [{"b": 1, "a": [1, 2]}]}
    raw.write_raw(tmp_path / "one.json.gz", env)
    raw.write_raw(tmp_path / "two.json.gz", json.loads(json.dumps(env)))
    assert (tmp_path / "one.json.gz").read_bytes() == (tmp_path / "two.json.gz").read_bytes()
    assert raw.read_raw(tmp_path / "one.json.gz") == env


def test_replace_day_drops_earlier_same_day_files(tmp_path):
    ok = {"name": "a", "employer": "A", "ats": "ashby", "ok": True, "count": 1, "error": None,
          "envelope": {"source": "a", "ats": "ashby", "pages": []}}
    fail_b = {"name": "b", "employer": "B", "ats": "lever", "ok": False, "count": 0, "error": "HTTP 500", "envelope": None}
    ok_b = dict(fail_b, ok=True, count=3, error=None, envelope={"source": "b", "ats": "lever", "pages": []})
    raw.replace_day(tmp_path, "2026-11-01", [ok, ok_b], "2026-11-01T11:00:00Z")
    assert (tmp_path / "2026-11-01" / "b.json.gz").exists()
    raw.replace_day(tmp_path, "2026-11-01", [ok, fail_b], "2026-11-01T12:00:00Z")
    files = sorted(p.name for p in (tmp_path / "2026-11-01").iterdir())
    assert files == ["_run.json", "a.json.gz"]
    record = json.loads((tmp_path / "2026-11-01" / "_run.json").read_text(encoding="utf-8"))
    assert record["sources"][1] == {"name": "b", "employer": "B", "ats": "lever", "ok": False, "count": 0, "error": "HTTP 500"}


def test_empty_raw_dir(tmp_path):
    res = build_history(tmp_path / "raw")
    assert res.rows == [] and res.dates == []
