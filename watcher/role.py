"""The title rule: is a posting in my role?

Plain English (copied to the README):

    My role is accounting and finance: accounting and finance consulting, and
    the jobs open to someone with an accounting and finance undergraduate
    degree and a master's in finance.

    A posting is in my role when its title, ignoring case, passes all three
    checks:

    1. It contains an accounting or finance word: accounting, accountant,
       accounts payable/receivable, audit, auditor, assurance, tax, CPA, SOX,
       internal controls, bookkeeper, finance, financial, FP&A, treasury,
       budget, valuation, credit, lending, loan, underwriting, investment,
       banking, banker, capital markets, private equity, equity research,
       portfolio, wealth, asset management, fund, M&A, mergers, transaction,
       deal, due diligence, restructuring, forensic, CFO, economic consulting,
       or risk.
    2. It is not a manager-level or higher job: no manager, director, vice
       president / VP, principal, partner, head, chief, president, controller
       or "managing" in the title.
    3. It is not a technology job: no engineer, developer, architect,
       software, programmer, cyber, DevOps or "data scientist" in the title.

    Only the job title is used, nothing else about the posting.

Each word is matched as a whole word, so "Taxonomy Specialist" is not a tax
job and "Auditorium Technician" is not an audit job.
"""

from __future__ import annotations

import re

FINANCE_WORDS = (
    r"accounting",
    r"accountants?",
    r"accounts\s+(?:payable|receivable)",
    r"audit(?:s|ing|ors?)?",
    r"assurance",
    r"tax(?:es|ation)?",
    r"cpa",
    r"sox",
    r"internal\s+controls?",
    r"bookkeep(?:er|ers|ing)",
    r"finance",
    r"financial",
    r"fp\s*&\s*a",
    r"treasury",
    r"budget(?:s|ing)?",
    r"valuations?",
    r"credit",
    r"lending",
    r"loans?",
    r"underwrit(?:er|ers|ing)",
    r"investments?",
    r"banking",
    r"bankers?",
    r"capital\s+markets",
    r"private\s+equity",
    r"equity\s+research",
    r"portfolio",
    r"wealth",
    r"asset\s+management",
    r"funds?",
    r"m\s*&\s*a",
    r"mergers",
    r"transactions?",
    r"deals?",
    r"due\s+diligence",
    r"restructuring",
    r"forensics?",
    r"cfo",
    r"economic\s+consulting",
    r"risk",
)

SENIOR_WORDS = (
    r"managers?",
    r"mgr",
    r"managing",
    r"directors?",
    r"vice\s+president",
    r"s?vp",
    r"avp",
    r"principals?",
    r"partners?",
    r"head",
    r"chief",
    r"president",
    r"controllers?",
)

TECH_WORDS = (
    r"engineers?",
    r"engineering",
    r"developers?",
    r"architects?",
    r"software",
    r"programmers?",
    r"cyber\w*",
    r"devops",
    r"data\s+scientists?",
)


def _compile(words: tuple[str, ...]) -> re.Pattern[str]:
    # (?<![\w&]) / (?![\w&]) act as word boundaries that also work around "&".
    return re.compile(r"(?<![\w&])(?:" + "|".join(words) + r")(?![\w&])", re.IGNORECASE)


FINANCE_RE = _compile(FINANCE_WORDS)
SENIOR_RE = _compile(SENIOR_WORDS)
TECH_RE = _compile(TECH_WORDS)


def in_role(title: str | None) -> bool:
    """True when the title matches the rule stated in this module's docstring."""
    if not title:
        return False
    if FINANCE_RE.search(title) is None:
        return False
    if SENIOR_RE.search(title) or TECH_RE.search(title):
        return False
    return True
