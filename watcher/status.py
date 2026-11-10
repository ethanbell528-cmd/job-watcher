"""Write data/status.json, which describes the latest run.

Keys: run_time (UTC, ISO 8601), first_run_date (date of the earliest raw file),
days_with_success (number of different dates with a raw file), open (open
postings), new_today (postings first seen on the run date, leaving out
first-run postings), removed_today (postings removed on the run date) and
sources (one entry per source: name, ok, count, plus employer, ats, error).
"""

from __future__ import annotations

import json
from pathlib import Path


def compute_status(rows: list[dict], dates: list[str], run_time: str, run_date: str, results: list[dict]) -> dict:
    return {
        "run_time": run_time,
        "first_run_date": dates[0] if dates else None,
        "days_with_success": len(set(dates)),
        "open": sum(1 for r in rows if r["status"] == "open"),
        "new_today": sum(1 for r in rows if r["first_seen"] == run_date and not r["first_run"]),
        "removed_today": sum(1 for r in rows if r["removed_date"] == run_date),
        "sources": [
            {
                "name": r["name"],
                "ok": bool(r["ok"]),
                "count": int(r["count"]) if r["ok"] else 0,
                "employer": r.get("employer", ""),
                "ats": r.get("ats", ""),
                "error": r.get("error"),
            }
            for r in results
        ],
    }


def write_status(status: dict, path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
