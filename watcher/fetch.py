"""Call each job board's public JSON API and return what it returned.

One function per ATS. Each returns the list of raw page responses (parsed
JSON, unchanged). Only JSON endpoints are used, never HTML, and no login.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .normalize import normalize
from .sources import validate_source

USER_AGENT = "job-watcher/1.0"
TIMEOUT = (15, 60)  # connect, read seconds
PAGE_DELAY = 0.2  # seconds between pages of one board, to be polite

WORKDAY_PAGE = 20  # Workday rejects limit > 20
WORKDAY_OFFSET_CAP = 2000  # some tenants error past ~2000 results
WORKDAY_HARD_STOP = 10000  # safety net if 'total' is missing
SMARTRECRUITERS_PAGE = 100


class FetchError(Exception):
    pass


def make_session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "POST"}),
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    s.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
    return s


def _json(resp: requests.Response):
    if resp.status_code != 200:
        raise FetchError(f"HTTP {resp.status_code} from {resp.url}: {resp.text[:200]!r}")
    try:
        return resp.json()
    except ValueError as exc:
        ctype = resp.headers.get("content-type", "")
        raise FetchError(f"non-JSON response ({ctype}) from {resp.url}") from exc


def fetch_workday(src: dict, session: requests.Session) -> list:
    url = f"https://{src['host']}/wday/cxs/{src['tenant']}/{src['site']}/jobs"
    pages: list = []
    seen: set[str] = set()
    total = None
    offset = 0
    while True:
        body = {"appliedFacets": {}, "limit": WORKDAY_PAGE, "offset": offset, "searchText": src.get("search", "")}
        try:
            page = _json(session.post(url, json=body, timeout=TIMEOUT))
        except (requests.RequestException, FetchError):
            # Past the tenant's offset cap an error is expected: keep what we have.
            # Earlier, an error would leave a partial list (and false removals), so fail.
            if offset >= WORKDAY_OFFSET_CAP and pages:
                break
            raise
        if not isinstance(page, dict) or "jobPostings" not in page:
            raise FetchError(f"unexpected Workday response at offset {offset}")
        if offset == 0:
            total = page.get("total")  # later pages often report total = 0
        postings = page.get("jobPostings") or []
        new = [p for p in postings if p.get("externalPath") not in seen]
        if not new:
            # Empty page, or Workday wrapped around to page 1 (it does past `total`).
            break
        pages.append(page)
        seen.update(p.get("externalPath") for p in postings)
        offset += WORKDAY_PAGE
        if total and offset >= total:
            break
        if offset >= WORKDAY_HARD_STOP:
            break
        time.sleep(PAGE_DELAY)
    return pages


def fetch_greenhouse(src: dict, session: requests.Session) -> list:
    # content=false keeps raw files small but drops departments, so the
    # departments endpoint (jobs grouped by department, also without content)
    # is fetched as a second page and joined in normalize.
    base = f"https://boards-api.greenhouse.io/v1/boards/{src['token']}"
    jobs = _json(session.get(f"{base}/jobs", params={"content": "false"}, timeout=TIMEOUT))
    if not isinstance(jobs, dict) or "jobs" not in jobs:
        raise FetchError("unexpected Greenhouse jobs response")
    time.sleep(PAGE_DELAY)
    depts = _json(session.get(f"{base}/departments", timeout=TIMEOUT))
    if not isinstance(depts, dict) or "departments" not in depts:
        raise FetchError("unexpected Greenhouse departments response")
    return [jobs, depts]


def fetch_lever(src: dict, session: requests.Session) -> list:
    data = _json(session.get(f"https://api.lever.co/v0/postings/{src['token']}", params={"mode": "json"}, timeout=TIMEOUT))
    if not isinstance(data, list):
        raise FetchError("unexpected Lever response (expected a list)")
    return [data]


def fetch_ashby(src: dict, session: requests.Session) -> list:
    data = _json(session.get(f"https://api.ashbyhq.com/posting-api/job-board/{src['token']}", timeout=TIMEOUT))
    if not isinstance(data, dict) or "jobs" not in data:
        raise FetchError("unexpected Ashby response")
    return [data]


def fetch_smartrecruiters(src: dict, session: requests.Session) -> list:
    url = f"https://api.smartrecruiters.com/v1/companies/{src['token']}/postings"
    pages, offset = [], 0
    while True:
        params = {"limit": SMARTRECRUITERS_PAGE, "offset": offset}
        if src.get("search"):
            params["q"] = src["search"]
        page = _json(session.get(url, params=params, timeout=TIMEOUT))
        if not isinstance(page, dict) or "content" not in page:
            raise FetchError(f"unexpected SmartRecruiters response at offset {offset}")
        content = page.get("content") or []
        if not content and pages:
            break
        pages.append(page)
        offset += SMARTRECRUITERS_PAGE
        if not content or offset >= (page.get("totalFound") or 0):
            break
        time.sleep(PAGE_DELAY)
    return pages


FETCHERS = {
    "workday": fetch_workday,
    "greenhouse": fetch_greenhouse,
    "lever": fetch_lever,
    "ashby": fetch_ashby,
    "smartrecruiters": fetch_smartrecruiters,
}


def fetch_source(src: dict, fetched_at: str) -> dict:
    """Fetch one source. Never raises: returns a result dict.

    result = {name, employer, ats, ok, count, error, seconds, envelope}
    ``envelope`` is the raw-file content (None when the source failed).

    A board that returns zero postings is treated as a failure: for the
    employers watched here an empty list is almost always a glitch or a wrong
    token, and accepting it would mark every open posting removed.
    """
    result = {
        "name": src["name"],
        "employer": src.get("employer", ""),
        "ats": src.get("ats", ""),
        "ok": False,
        "count": 0,
        "error": None,
        "seconds": 0.0,
        "envelope": None,
    }
    t0 = time.monotonic()
    try:
        problems = validate_source(src)
        if problems:
            raise FetchError("bad config: " + "; ".join(problems))
        with make_session() as session:
            pages = FETCHERS[src["ats"]](src, session)
        envelope = {
            "source": src["name"],
            "employer": src["employer"],
            "ats": src["ats"],
            "config": src,
            "fetched_at": fetched_at,
            "search": src.get("search", ""),
            "pages": pages,
        }
        postings = normalize(envelope)  # proves the raw file is buildable
        if not postings:
            raise FetchError("board returned no postings")
        result.update(ok=True, count=len(postings), envelope=envelope)
    except Exception as exc:  # one source failing must not stop the run
        result["error"] = f"{type(exc).__name__}: {exc}"[:500]
    result["seconds"] = round(time.monotonic() - t0, 1)
    return result


def fetch_all(sources: list[dict], fetched_at: str, workers: int = 6) -> list[dict]:
    """Fetch every source (several boards at a time); results keep config order."""
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        return list(pool.map(lambda s: fetch_source(s, fetched_at), sources))
