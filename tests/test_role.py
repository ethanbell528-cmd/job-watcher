"""The title rule."""

import pytest

from watcher.role import in_role


@pytest.mark.parametrize(
    "title",
    [
        "Consultant",
        "Senior Consultant - Healthcare",
        "Management Consulting Associate",
        "Consulting Manager",
        "Strategy Consultants",
        "Consultancy Lead",
        "Financial Analyst",
        "FP&A Analyst II",
        "Business Analyst",
        "Sr. Data Analyst",
        "Operations Analyst (Remote)",
        "Strategy & Operations Analysts",
        "ANALYST, CREDIT RISK",
        "Analyst/Associate - Investment Banking",
        "Summer Intern - Consulting",
        "Sales Analyst",  # exclusions only apply to "consultant"
        "Sales Consultant / Strategy Consultant",  # one excluded phrase does not cancel the other
        "IT Consultant",
        "Pre-Sales Solution Consultant",  # "solution consultant" is not excluded
    ],
)
def test_in_role(title):
    assert in_role(title) is True


@pytest.mark.parametrize(
    "title",
    [
        "Software Engineer",
        "Data Scientist",
        "Analytics Engineer",  # "analytics" is not the word "analyst"
        "Business Intelligence Developer",
        "Psychoanalyst",  # word boundary
        "Consultation Coordinator",  # "consultation" is not in the list
        "Lactation Consultant",
        "Beauty Consultant - Part Time",
        "Leasing Consultant",
        "Sales Consultant",
        "Retail Sales Consultant",
        "Travel Consultant",
        "Skin Care Consultant",
        "Wardrobe Consultants",
        "",
        None,
    ],
)
def test_not_in_role(title):
    assert in_role(title) is False
