"""Convert a raw file (what a board returned) into the common columns.

Every converter takes the raw *envelope* written by the fetch stage::

    {"source": name, "employer": ..., "ats": ..., "config": {source entry},
     "fetched_at": ..., "search": ..., "pages": [raw responses, in order]}

and returns a list of dicts with the keys in ``POSTING_COLUMNS``. Everything a
converter needs (employer, Workday host/site, tokens) is read from the raw file
itself, never from sources.json, so the history depends on the raw files alone.

Columns a source does not provide are left as "".
"""

from __future__ import annotations

from datetime import datetime, timezone

POSTING_COLUMNS = (
    "source",
    "source_id",
    "employer",
    "title",
    "location",
    "department",
    "posted_date",
    "url",
)


def clean(value) -> str:
    """Text cell: None -> "", whitespace (incl. newlines) collapsed to one space."""
    if value is None:
        return ""
    return " ".join(str(value).split())


def iso_to_utc_date(value) -> str:
    """ISO-8601 timestamp (any offset, or 'Z') -> UTC 'YYYY-MM-DD'; '' if unparseable."""
    if not value or not isinstance(value, str):
        return ""
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")


def ms_to_utc_date(value) -> str:
    """Epoch milliseconds -> UTC 'YYYY-MM-DD'; '' if missing."""
    if value in (None, ""):
        return ""
    try:
        return datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    except (TypeError, ValueError, OverflowError, OSError):
        return ""


def join_locations(primary, others) -> str:
    """Primary location first, then the other distinct locations, joined with "; "."""
    out = []
    for loc in [primary, *(others or [])]:
        loc = clean(loc)
        if loc and loc not in out:
            out.append(loc)
    return "; ".join(out)


def _row(env: dict, source_id, title, location, department, posted_date, url) -> dict:
    return {
        "source": env["source"],
        "source_id": clean(source_id),
        "employer": clean(env.get("employer") or env.get("config", {}).get("employer")),
        "title": clean(title),
        "location": clean(location),
        "department": clean(department),
        "posted_date": posted_date or "",
        "url": clean(url),
    }


def workday_source_id(external_path: str) -> str:
    """Stable id for a Workday posting.

    externalPath looks like ``/job/<location>/<Title-Slug>_<ReqId>[-<n>]``.
    The part after the last "_" is the requisition id plus an optional posting
    suffix: it does not change when the title is edited (the slug does), and,
    unlike the req id in bulletFields, it stays unique when one requisition is
    posted more than once (``JR-1``, ``JR-1-1``). bulletFields is also not
    guaranteed to hold the req id on every tenant. If the path has no "_", the
    whole last segment is used.
    """
    last = (external_path or "").rstrip("/").rsplit("/", 1)[-1]
    if "_" in last:
        tail = last.rsplit("_", 1)[1]
        if tail:
            return tail
    return last


def normalize_workday(env: dict) -> list[dict]:
    cfg = env["config"]
    host, site = cfg["host"], cfg["site"]
    rows = []
    for page in env["pages"]:
        for p in page.get("jobPostings") or []:
            path = p.get("externalPath") or ""
            if not path:
                continue
            rows.append(
                _row(
                    env,
                    workday_source_id(path),
                    p.get("title"),
                    p.get("locationsText"),
                    "",  # Workday's list endpoint has no department
                    "",  # postedOn is relative text ("Posted 3 Days Ago"), not a date
                    f"https://{host}/en-US/{site}{path}",
                )
            )
    return rows


def normalize_greenhouse(env: dict) -> list[dict]:
    """pages[0] = /jobs?content=false, pages[1] = /departments (for department names)."""
    jobs_page = env["pages"][0]
    dept_names: dict[str, list[str]] = {}
    if len(env["pages"]) > 1:
        for dept in env["pages"][1].get("departments") or []:
            for job in dept.get("jobs") or []:
                names = dept_names.setdefault(str(job.get("id")), [])
                name = clean(dept.get("name"))
                if name and name not in names:
                    names.append(name)
    rows = []
    for j in jobs_page.get("jobs") or []:
        jid = j.get("id")
        if jid is None:
            continue
        depts = [clean(d.get("name")) for d in (j.get("departments") or []) if d.get("name")]
        if not depts:
            depts = dept_names.get(str(jid), [])
        rows.append(
            _row(
                env,
                jid,
                j.get("title"),
                (j.get("location") or {}).get("name"),
                "; ".join(depts),
                iso_to_utc_date(j.get("first_published")),
                j.get("absolute_url"),
            )
        )
    return rows


def normalize_lever(env: dict) -> list[dict]:
    rows = []
    for page in env["pages"]:
        for p in page if isinstance(page, list) else []:
            if not p.get("id"):
                continue
            cats = p.get("categories") or {}
            rows.append(
                _row(
                    env,
                    p["id"],
                    p.get("text"),
                    join_locations(cats.get("location"), cats.get("allLocations")),
                    cats.get("department") or cats.get("team"),
                    ms_to_utc_date(p.get("createdAt")),
                    p.get("hostedUrl"),
                )
            )
    return rows


def normalize_ashby(env: dict) -> list[dict]:
    rows = []
    for page in env["pages"]:
        for j in page.get("jobs") or []:
            if not j.get("id"):
                continue
            rows.append(
                _row(
                    env,
                    j["id"],
                    j.get("title"),
                    join_locations(
                        j.get("location"),
                        [s.get("location") for s in (j.get("secondaryLocations") or []) if isinstance(s, dict)],
                    ),
                    j.get("department") or j.get("team"),
                    iso_to_utc_date(j.get("publishedAt")),
                    j.get("jobUrl"),
                )
            )
    return rows


def normalize_smartrecruiters(env: dict) -> list[dict]:
    token = env["config"]["token"]
    rows = []
    for page in env["pages"]:
        for p in page.get("content") or []:
            if not p.get("id"):
                continue
            loc = p.get("location") or {}
            location = loc.get("fullLocation") or ", ".join(
                clean(loc.get(k)) for k in ("city", "region", "country") if loc.get(k)
            )
            rows.append(
                _row(
                    env,
                    p["id"],
                    p.get("name"),
                    location,
                    # department is often {}; the job function is the closest substitute
                    (p.get("department") or {}).get("label") or (p.get("function") or {}).get("label"),
                    iso_to_utc_date(p.get("releasedDate")),
                    f"https://jobs.smartrecruiters.com/{token}/{p['id']}",
                )
            )
    return rows


CONVERTERS = {
    "workday": normalize_workday,
    "greenhouse": normalize_greenhouse,
    "lever": normalize_lever,
    "ashby": normalize_ashby,
    "smartrecruiters": normalize_smartrecruiters,
}


def normalize(env: dict) -> list[dict]:
    """Raw envelope -> postings in common columns, duplicates (same source_id) removed.

    When one raw file lists an id twice (e.g. Workday repeating a posting
    across pages), the first occurrence is kept.
    """
    ats = env.get("ats")
    if ats not in CONVERTERS:
        raise ValueError(f"unknown ats {ats!r}")
    out, seen = [], set()
    for row in CONVERTERS[ats](env):
        sid = row["source_id"]
        if not sid or sid in seen:
            continue
        seen.add(sid)
        out.append(row)
    return out
