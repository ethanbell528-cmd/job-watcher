"""Load the watch list (sources.json at the repository root).

Each entry is a JSON object. Common keys: ``name`` (slug used for the raw file
name and as ``source`` in the history), ``employer``, ``ats`` and ``search``
(a search term sent to boards with more than 5,000 postings; "" means none).

ATS-specific keys:
  workday:                     tenant, host, site
  greenhouse, lever, ashby,
  smartrecruiters:             token
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ATS_KEYS = {
    "workday": ("tenant", "host", "site"),
    "greenhouse": ("token",),
    "lever": ("token",),
    "ashby": ("token",),
    "smartrecruiters": ("token",),
}

NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def validate_source(src: dict) -> list[str]:
    """Return a list of problems with one source entry (empty list = valid)."""
    problems = []
    ats = src.get("ats")
    if ats not in ATS_KEYS:
        problems.append(f"unknown ats {ats!r}")
        return problems
    for key in ("employer",) + ATS_KEYS[ats]:
        if not str(src.get(key) or "").strip():
            problems.append(f"missing {key!r}")
    if src.get("search") and ats in ("greenhouse", "lever", "ashby"):
        problems.append(f"{ats} has no server-side search; leave 'search' empty")
    return problems


def load_sources(path: str | Path) -> list[dict]:
    """Read and lightly validate the watch list.

    Structural problems (not a list, bad or duplicate names) raise ValueError
    because they would make raw file names ambiguous. Per-entry problems
    (missing keys, unknown ATS) do not raise: the entry is returned and the
    fetch stage records it as a failed source, so one bad entry cannot stop
    the run.
    """
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"{path}: expected a JSON array of sources")
    seen = set()
    out = []
    for i, src in enumerate(data):
        if not isinstance(src, dict):
            raise ValueError(f"{path}: entry {i} is not an object")
        name = src.get("name", "")
        if not isinstance(name, str) or not NAME_RE.match(name):
            raise ValueError(f"{path}: entry {i} has invalid name {name!r} (use a-z, 0-9, _ or -)")
        if name in seen:
            raise ValueError(f"{path}: duplicate source name {name!r}")
        seen.add(name)
        src = dict(src)
        src.setdefault("search", "")
        out.append(src)
    return out
