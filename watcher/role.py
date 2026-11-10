"""The title rule: is a posting in my role?

Plain English (copied to the README):

    A posting is in my role when its title, ignoring case, contains the whole
    word "consult", "consultant(s)", "consulting" or "consultancy", or the
    whole word "analyst(s)". Consulting titles used for retail, sales or
    personal-service jobs do not count: "lactation consultant", "beauty
    consultant", "skincare consultant", "leasing consultant", "sales
    consultant", "retail consultant", "travel consultant", "fitness
    consultant", "wedding consultant", "fashion consultant", "style
    consultant" and "wardrobe consultant". Only the job title is used,
    nothing else about the posting.

How the exclusions work: each excluded phrase is removed from the title first
and the title is then checked again, so "Sales Consultant" is out but
"Sales Analyst" or "Sales Consultant / Strategy Consultant" is in.
"""

from __future__ import annotations

import re

ROLE_RE = re.compile(r"\b(?:consult(?:ants?|ing|ancy)?|analysts?)\b", re.IGNORECASE)

EXCLUDED_CONSULTANT_WORDS = (
    "lactation",
    "beauty",
    "skincare",
    "skin care",
    "leasing",
    "sales",
    "retail",
    "travel",
    "fitness",
    "wedding",
    "fashion",
    "style",
    "wardrobe",
)

EXCLUDE_RE = re.compile(
    r"\b(?:" + "|".join(re.escape(w).replace(r"\ ", r"\s+") for w in EXCLUDED_CONSULTANT_WORDS) + r")\s+consultants?\b",
    re.IGNORECASE,
)


def in_role(title: str | None) -> bool:
    """True when the title matches the rule stated in this module's docstring."""
    if not title:
        return False
    remaining = EXCLUDE_RE.sub(" ", title)
    return ROLE_RE.search(remaining) is not None
