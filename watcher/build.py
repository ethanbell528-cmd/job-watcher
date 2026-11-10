"""Build data/history.csv from the raw files alone.

    uv run python -m watcher.build            # reads data/raw, writes data/history.csv

Day by day (oldest first), for every source that has a raw file that day:

1. Convert every posting to the common columns (``normalize``) and mark it in
   role or not (``role.in_role``).
2. A posting seen for the first time gets that day as first_seen. Every posting
   the source lists that day gets that day as last_seen. An open posting of that
   source that the file no longer lists is marked removed with that day's date.
   A removed posting listed again becomes open, its removed_date cleared and
   first_seen unchanged.

A source with no raw file on a day (it failed, or was not watched yet) changes
nothing for its postings that day. ``first_run`` is true for postings listed in
the first raw file of their source. Title, location, department, posted_date,
url and employer come from the most recent file that listed the posting.
A raw file that cannot be read is skipped with a warning, exactly as if it did
not exist. Rows are sorted by posting_id. Nothing but the raw files is read,
so rebuilding gives a byte-identical file.
"""

from __future__ import annotations

import argparse
import csv
import sys
from dataclasses import dataclass, field
from pathlib import Path

from . import raw
from .normalize import normalize
from .role import in_role

HISTORY_COLUMNS = (
    "posting_id",
    "source",
    "source_id",
    "employer",
    "title",
    "location",
    "department",
    "posted_date",
    "url",
    "in_role",
    "first_run",
    "first_seen",
    "last_seen",
    "status",
    "removed_date",
)

LATEST_FIELDS = ("employer", "title", "location", "department", "posted_date", "url")


@dataclass
class BuildResult:
    rows: list[dict]
    dates: list[str] = field(default_factory=list)  # dates with at least one readable raw file
    warnings: list[str] = field(default_factory=list)


def build_history(raw_dir: str | Path) -> BuildResult:
    raw_dir = Path(raw_dir)
    postings: dict[str, dict] = {}
    seen_sources: set[str] = set()
    by_source: dict[str, set[str]] = {}  # source -> every posting_id it has listed
    dates: list[str] = []
    warnings: list[str] = []

    for day_dir in raw.day_dirs(raw_dir):
        date = day_dir.name
        any_file = False
        for path in raw.raw_files(day_dir):
            source = raw.source_name(path)
            try:
                env = raw.read_raw(path)
                env["source"] = source  # the file name is the source key
                listed = normalize(env)
            except Exception as exc:
                msg = f"skipping unreadable raw file {path.as_posix()}: {type(exc).__name__}: {exc}"
                warnings.append(msg)
                print(f"WARNING: {msg}", file=sys.stderr)
                continue
            any_file = True
            is_first_file = source not in seen_sources
            seen_sources.add(source)

            listed_ids = set()
            for p in listed:
                pid = f"{source}:{p['source_id']}"
                listed_ids.add(pid)
                row = postings.get(pid)
                if row is None:
                    row = {
                        "posting_id": pid,
                        "source": source,
                        "source_id": p["source_id"],
                        "first_run": is_first_file,
                        "first_seen": date,
                        "removed_date": "",
                    }
                    postings[pid] = row
                for k in LATEST_FIELDS:
                    row[k] = p[k]
                row["in_role"] = in_role(p["title"])
                row["last_seen"] = date
                row["status"] = "open"
                row["removed_date"] = ""

            by_source.setdefault(source, set()).update(listed_ids)
            for pid in by_source[source] - listed_ids:
                row = postings[pid]
                if row["status"] == "open":
                    row["status"] = "removed"
                    row["removed_date"] = date
        if any_file:
            dates.append(date)

    rows = [postings[k] for k in sorted(postings)]
    return BuildResult(rows=rows, dates=dates, warnings=warnings)


def _cell(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return "" if value is None else str(value)


def write_history(rows: list[dict], path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
        w.writerow(HISTORY_COLUMNS)
        for r in rows:
            w.writerow([_cell(r.get(c)) for c in HISTORY_COLUMNS])
    tmp.replace(path)


def build(data_dir: str | Path = "data") -> BuildResult:
    data_dir = Path(data_dir)
    result = build_history(data_dir / "raw")
    write_history(result.rows, data_dir / "history.csv")
    return result


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Build data/history.csv from data/raw.")
    ap.add_argument("--data-dir", default="data", help="folder holding raw/ (default: data)")
    args = ap.parse_args(argv)
    result = build(args.data_dir)
    n_open = sum(1 for r in result.rows if r["status"] == "open")
    print(f"history.csv: {len(result.rows)} postings ({n_open} open) from {len(result.dates)} day(s) of raw files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
