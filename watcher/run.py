"""The daily pipeline: fetch every source -> raw files -> history -> status -> issue.

    uv run python -m watcher.run [--data-dir data] [--sources sources.json] [--no-issue]

Committing the data is done by the GitHub Actions workflow, not here.
Exit code is 0 when at least one source succeeded (failed sources are recorded
in data/status.json, data/raw/<date>/_run.json and the issue) and 1 only when
every source failed; in that case nothing in the data folder is changed.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from . import raw
from .build import build
from .fetch import fetch_all
from .issue import build_issue_body, publish_issue
from .sources import load_sources
from .status import compute_status, write_status


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Run the daily job watcher pipeline.")
    ap.add_argument("--data-dir", default="data")
    ap.add_argument("--sources", default="sources.json")
    ap.add_argument("--no-issue", action="store_true", help="do not open/update the GitHub issue")
    ap.add_argument("--workers", type=int, default=6, help="boards fetched at the same time")
    args = ap.parse_args(argv)

    # The run date is the UTC date at the moment the run starts, taken once.
    started = datetime.now(timezone.utc).replace(microsecond=0)
    run_time = started.strftime("%Y-%m-%dT%H:%M:%SZ")
    run_date = started.strftime("%Y-%m-%d")
    data_dir = Path(args.data_dir)
    t0 = time.monotonic()

    sources = load_sources(args.sources)
    print(f"[{run_time}] fetching {len(sources)} sources")
    results = fetch_all(sources, run_time, workers=args.workers)
    for r in results:
        state = f"ok   {r['count']:>6}" if r["ok"] else f"FAIL {'':>6}"
        print(f"  {state}  {r['name']:<24} {r['ats']:<16} {r['seconds']:>6.1f}s  {r['error'] or ''}")
    n_ok = sum(r["ok"] for r in results)
    print(f"{n_ok}/{len(results)} sources ok")

    if n_ok == 0:
        print("every source failed; leaving the data folder unchanged", file=sys.stderr)
        return 1

    raw.replace_day(data_dir / "raw", run_date, results, run_time)
    result = build(data_dir)
    status = compute_status(result.rows, result.dates, run_time, run_date, results)
    write_status(status, data_dir / "status.json")
    print(
        f"history: {len(result.rows)} postings, open {status['open']}, "
        f"new today {status['new_today']}, removed today {status['removed_today']}, "
        f"days with success {status['days_with_success']}"
    )

    if args.no_issue:
        print("issue skipped: --no-issue")
    else:
        body = build_issue_body(run_date, result.rows, results)
        print(publish_issue(run_date, body))

    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as fh:
            fh.write(f"run_date={run_date}\n")
    print(f"done in {time.monotonic() - t0:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
