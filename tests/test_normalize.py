"""Conversion of each ATS's raw response to the common columns."""

import json
from pathlib import Path

import pytest

from watcher.normalize import POSTING_COLUMNS, iso_to_utc_date, normalize, workday_source_id

FIXTURES = Path(__file__).parent / "fixtures"


def load(name):
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def row(source, source_id, employer, title, location, department, posted_date, url):
    return dict(zip(POSTING_COLUMNS, (source, source_id, employer, title, location, department, posted_date, url)))


def test_workday():
    out = normalize(load("workday"))
    assert out == [
        row("huron", "JR-0015442", "Huron Consulting Group", "Technical Architect, Microsoft D365 F&SCM - Canada",
            "2 Locations", "", "",
            "https://huron.wd1.myworkdayjobs.com/en-US/huroncareers/job/Toronto---55-University-Ave/Technical-Architect--Microsoft-D365-F-SCM---Canada_JR-0015442"),
        # whitespace collapsed; duplicate on page 2 dropped
        row("huron", "JR-0015001-1", "Huron Consulting Group", "Healthcare Consultant", "Chicago, IL", "", "",
            "https://huron.wd1.myworkdayjobs.com/en-US/huroncareers/job/Chicago-IL/Healthcare-Consultant_JR-0015001-1"),
        # no "_" in the last path segment -> whole segment is the id
        row("huron", "Financial-Analyst", "Huron Consulting Group", "Financial Analyst", "Remote", "", "",
            "https://huron.wd1.myworkdayjobs.com/en-US/huroncareers/job/Remote/Financial-Analyst"),
    ]


def test_greenhouse():
    out = normalize(load("greenhouse"))
    assert out == [
        # first_published -05:00 late evening -> next UTC day
        row("airbnb", "8365363", "Airbnb", "Account Executive (Hotels)", "Barcelona, Spain", "Sales", "2026-11-10",
            "https://careers.airbnb.com/positions/8365363?gh_jid=8365363"),
        # in two departments; no first_published -> empty
        row("airbnb", "7000001", "Airbnb", "Senior Strategy Analyst", "Remote, USA", "Finance; Strategy", "",
            "https://careers.airbnb.com/positions/7000001?gh_jid=7000001"),
    ]


def test_lever():
    out = normalize(load("lever"))
    assert out == [
        row("spotify", "2a55d6c9-c564-443a-be3e-a3851db5a93b", "Spotify", "Account Executive - Commercial, Spotify Technology",
            "New York, NY", "Operations and Business Support", "2026-10-23",
            "https://jobs.lever.co/spotify/2a55d6c9-c564-443a-be3e-a3851db5a93b"),
        # all distinct locations, primary first; no department -> team; no createdAt -> empty date
        row("spotify", "b1", "Spotify", "Data Analyst", "Stockholm; London", "Insights", "", "https://jobs.lever.co/spotify/b1"),
    ]


def test_ashby():
    out = normalize(load("ashby"))
    assert out == [
        # title stripped; location + secondaryLocations, distinct, whitespace collapsed
        row("ramp", "34413f8d-26bf-4bbc-8ade-eb309a0e2245", "Ramp", "Security Engineer, Cloud",
            "New York, NY (HQ); Remote (Canada); Miami, FL", "Engineering", "2026-04-07", "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245"),
        row("ramp", "a2", "Ramp", "FP&A Analyst", "Remote", "Finance", "", "https://jobs.ashbyhq.com/ramp/a2"),
    ]


def test_smartrecruiters():
    out = normalize(load("smartrecruiters"))
    assert out == [
        # empty department object -> function label
        row("bosch", "744000160978230", "Bosch Group", "Accounts Receivable Manager", "Lincolnshire, IL, United States",
            "Accounting/Auditing", "2026-11-10", "https://jobs.smartrecruiters.com/BoschGroup/744000160978230"),
        # no fullLocation -> city, region, country joined
        row("bosch", "744000160943939", "Bosch Group", "Supply Chain Analyst", "Stuttgart, de", "Logistics",
            "2026-11-01", "https://jobs.smartrecruiters.com/BoschGroup/744000160943939"),
        # unparseable date, no location, no department or function -> empty
        row("bosch", "744000160900000", "Bosch Group", "Business Analyst", "", "", "",
            "https://jobs.smartrecruiters.com/BoschGroup/744000160900000"),
    ]


@pytest.mark.parametrize("name", ["workday", "greenhouse", "lever", "ashby", "smartrecruiters"])
def test_every_converter_returns_exact_common_columns(name):
    for r in normalize(load(name)):
        assert tuple(r) == POSTING_COLUMNS
        assert all(isinstance(v, str) for v in r.values())


def test_unknown_ats_raises():
    with pytest.raises(ValueError):
        normalize({"source": "x", "ats": "taleo", "pages": []})


@pytest.mark.parametrize(
    "path, expected",
    [
        ("/job/NYC/Analyst_R123", "R123"),
        ("/job/NYC/Analyst_R123-2", "R123-2"),
        ("/job/NYC/Senior-Analyst_R123", "R123"),  # title edit keeps the id
        ("/job/NYC/NoUnderscore", "NoUnderscore"),
    ],
)
def test_workday_source_id(path, expected):
    assert workday_source_id(path) == expected


@pytest.mark.parametrize(
    "value, expected",
    [
        ("2026-11-10T22:17:54.649Z", "2026-11-10"),
        ("2026-11-10T20:00:00-05:00", "2026-11-11"),
        ("2026-11-10", "2026-11-10"),
        ("", ""),
        (None, ""),
        ("garbage", ""),
    ],
)
def test_iso_to_utc_date(value, expected):
    assert iso_to_utc_date(value) == expected
