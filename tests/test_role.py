"""The title rule."""

import pytest

from watcher.role import in_role


@pytest.mark.parametrize(
    "title",
    [
        "Financial Analyst",
        "FP&A Analyst II",
        "FP & A Associate",
        "Staff Accountant",
        "Senior Accountant",
        "Accounts Payable Specialist",
        "Audit Associate",
        "Internal Auditor",
        "Assurance Associate - Fall 2027",
        "Tax Associate",
        "Tax Consultant",
        "Consultant, Transaction Advisory",
        "Senior Consultant, CFO Advisory - Financial Services",
        "Finance & Accounting Consultant",
        "ANALYST, CREDIT RISK",
        "Analyst/Associate - Investment Banking",
        "M&A Analyst",
        "Valuation Analyst",
        "Treasury Analyst",
        "Forensic Accounting Associate",
        "Restructuring Associate",
        "Private Equity Fund Accountant",
        "Wealth Management Operations Analyst",
        "Summer Intern - Finance",
        "SOX Compliance Analyst",
    ],
)
def test_in_role(title):
    assert in_role(title) is True


@pytest.mark.parametrize(
    "title",
    [
        # no accounting or finance word
        "Consultant",
        "Business Analyst",
        "Management Consulting Associate",
        "Sales Consultant",
        "Data Scientist",
        "Taxonomy Specialist",  # whole words only
        "Auditorium Technician",
        "Recruiter",
        # manager level or higher
        "Finance Manager",
        "Senior Manager, Tax",
        "Director of Financial Reporting",
        "VP, Credit Risk",
        "Vice President - Investment Banking",
        "Audit Partner",
        "Principal, Valuation",
        "Head of Treasury",
        "Chief Financial Officer",
        "Managing Consultant, Finance",
        "Assistant Controller",
        "Portfolio Manager",
        # technology jobs
        "Software Engineer, Financial Systems",
        "Finance Data Engineer",
        "Developer - Tax Technology",
        "Cybersecurity Risk Analyst",
        "Solutions Architect, Banking",
        "",
        None,
    ],
)
def test_not_in_role(title):
    assert in_role(title) is False
