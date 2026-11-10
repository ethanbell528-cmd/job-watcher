"""Reading and writing raw files: data/raw/<YYYY-MM-DD>/<source>.json.gz.

Files whose names start with "_" (such as the per-day ``_run.json`` record of
every source's result) are bookkeeping, not raw board data, and are ignored by
the build.
"""

from __future__ import annotations

import gzip
import json
import re
import shutil
from pathlib import Path

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RAW_SUFFIX = ".json.gz"
RUN_RECORD = "_run.json"


def dumps(obj) -> str:
    """Deterministic JSON text (keys sorted) so identical content gives identical bytes."""
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def write_raw(path: Path, envelope: dict) -> None:
    """gzip with mtime=0 and no embedded file name: same content -> same bytes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    data = gzip.compress(dumps(envelope).encode("utf-8"), compresslevel=9, mtime=0)
    path.write_bytes(data)


def read_raw(path: Path) -> dict:
    with gzip.open(path, "rb") as fh:
        return json.loads(fh.read().decode("utf-8"))


def day_dirs(raw_dir: Path) -> list[Path]:
    """Date directories under raw_dir, oldest first."""
    if not raw_dir.is_dir():
        return []
    return sorted(p for p in raw_dir.iterdir() if p.is_dir() and DATE_RE.match(p.name))


def raw_files(day_dir: Path) -> list[Path]:
    """Raw board files in one day directory, sorted by source name."""
    return sorted(
        p for p in day_dir.iterdir()
        if p.is_file() and p.name.endswith(RAW_SUFFIX) and not p.name.startswith("_")
    )


def source_name(path: Path) -> str:
    return path.name[: -len(RAW_SUFFIX)]


def replace_day(raw_dir: Path, date: str, results: list[dict], run_time: str) -> Path:
    """Replace one day's raw files with this run's successes plus a _run.json record.

    A second run on the same day replaces that day's files, so a source that
    succeeded earlier today but fails now no longer has a file for today.
    """
    day = raw_dir / date
    if day.exists():
        shutil.rmtree(day)
    day.mkdir(parents=True)
    for r in results:
        if r["ok"]:
            write_raw(day / f"{r['name']}{RAW_SUFFIX}", r["envelope"])
    record = {
        "run_time": run_time,
        "sources": [
            {k: r[k] for k in ("name", "employer", "ats", "ok", "count", "error")} for r in results
        ],
    }
    (day / RUN_RECORD).write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    return day
