"""Pagination logic of the fetchers, with a fake session (no network)."""

import pytest

from watcher import fetch


class FakeResp:
    def __init__(self, payload, status=200):
        self.payload, self.status_code = payload, status
        self.url, self.text, self.headers = "https://fake", str(payload), {"content-type": "application/json"}

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, handler):
        self.handler, self.calls = handler, []

    def post(self, url, json=None, timeout=None):
        self.calls.append(json)
        return self.handler(json)

    def get(self, url, params=None, timeout=None):
        self.calls.append(params)
        return self.handler(params)


WD = {"name": "w", "employer": "W", "ats": "workday", "tenant": "t", "host": "h", "site": "s", "search": "analyst"}


def wd_page(offset, total_first, n_total):
    items = [{"title": f"T{i}", "externalPath": f"/job/x/T_{i}"} for i in range(offset, min(offset + 20, n_total))]
    if not items:  # Workday wraps back to page 1 past the end
        items = [{"title": f"T{i}", "externalPath": f"/job/x/T_{i}"} for i in range(0, 20)]
    return {"total": total_first if offset == 0 else 0, "jobPostings": items}


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(fetch.time, "sleep", lambda s: None)


def test_workday_paginates_with_first_page_total():
    s = FakeSession(lambda body: FakeResp(wd_page(body["offset"], 45, 45)))
    pages = fetch.fetch_workday(WD, s)
    assert [c["offset"] for c in s.calls] == [0, 20, 40]
    assert all(c["searchText"] == "analyst" and c["limit"] == 20 for c in s.calls)
    assert sum(len(p["jobPostings"]) for p in pages) == 45


def test_workday_stops_on_wraparound_when_total_missing():
    s = FakeSession(lambda body: FakeResp(wd_page(body["offset"], 0, 30)))
    pages = fetch.fetch_workday(WD, s)
    assert len(pages) == 2  # third request wrapped to page 1 and is discarded


def test_workday_error_past_offset_cap_keeps_pages():
    def handler(body):
        if body["offset"] >= fetch.WORKDAY_OFFSET_CAP:
            return FakeResp({"error": "too far"}, status=400)
        return FakeResp(wd_page(body["offset"], 5000, 5000))
    pages = fetch.fetch_workday(WD, FakeSession(handler))
    assert len(pages) == fetch.WORKDAY_OFFSET_CAP // 20


def test_workday_error_before_cap_fails_source():
    def handler(body):
        if body["offset"] == 20:
            return FakeResp({"error": "x"}, status=500)
        return FakeResp(wd_page(body["offset"], 60, 60))
    with pytest.raises(fetch.FetchError):
        fetch.fetch_workday(WD, FakeSession(handler))


def test_smartrecruiters_paginates_and_sends_search():
    def handler(params):
        o = params["offset"]
        n = max(0, min(100, 250 - o))
        return FakeResp({"totalFound": 250, "offset": o, "content": [{"id": str(o + i)} for i in range(n)]})
    s = FakeSession(handler)
    pages = fetch.fetch_smartrecruiters({"token": "T", "search": "analyst"}, s)
    assert [c["offset"] for c in s.calls] == [0, 100, 200]
    assert all(c["q"] == "analyst" for c in s.calls)
    assert sum(len(p["content"]) for p in pages) == 250


def test_html_response_is_an_error():
    class HtmlResp(FakeResp):
        def json(self):
            raise ValueError("not json")
    s = FakeSession(lambda params: HtmlResp("<html>"))
    with pytest.raises(fetch.FetchError):
        fetch.fetch_ashby({"token": "x"}, s)
