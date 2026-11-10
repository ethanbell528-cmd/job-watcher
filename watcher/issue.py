"""Open (or update) the daily GitHub Issue with the `gh` CLI.

Title: "Job watcher YYYY-MM-DD". The body lists the postings first seen on the
run date (leaving out first-run postings) and the postings removed on the run
date, each as a link, in-role postings first. One issue is opened every day,
even with no changes. A same-day re-run edits that day's issue instead of
opening another. Older open issues with the `job-watcher` label are closed.

Skipped (with a message, never failing the run) when `gh` is missing or no
GH_TOKEN/GITHUB_TOKEN is set.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile

LABEL = "job-watcher"
TITLE_PREFIX = "Job watcher "
MAX_BODY = 65536  # GitHub's limit on issue body characters
BODY_BUDGET = 64000  # stay safely under the limit


def issue_title(run_date: str) -> str:
    return f"{TITLE_PREFIX}{run_date}"


def _md_text(s: str) -> str:
    for ch in "\\[]*_`<>|":
        s = s.replace(ch, "\\" + ch)
    return s


def posting_line(r: dict) -> str:
    title = _md_text(r.get("title") or "(no title)")
    extra = " · ".join(_md_text(x) for x in (r.get("employer"), r.get("location")) if x)
    url = (r.get("url") or "").replace(" ", "%20").replace(")", "%29")
    link = f"[{title}]({url})" if url else title
    return f"- {link}" + (f" — {extra}" if extra else "")


def build_issue_body(run_date: str, rows: list[dict], results: list[dict], budget: int = BODY_BUDGET) -> str:
    """Pure function: the Markdown body of the issue for ``run_date``.

    Lists are cut with "…and N more" when the body would exceed ``budget``
    characters; in-role sections are filled first so they are kept in full
    whenever possible.
    """
    new = [r for r in rows if r["first_seen"] == run_date and not r["first_run"]]
    removed = [r for r in rows if r["removed_date"] == run_date]
    key = lambda r: (r.get("employer") or "", r.get("title") or "", r["posting_id"])  # noqa: E731
    sections = [
        ("New postings in my role", sorted((r for r in new if r["in_role"]), key=key)),
        ("Removed postings in my role", sorted((r for r in removed if r["in_role"]), key=key)),
        ("Other new postings", sorted((r for r in new if not r["in_role"]), key=key)),
        ("Other removed postings", sorted((r for r in removed if not r["in_role"]), key=key)),
    ]

    ok = [r for r in results if r["ok"]]
    failed = [r for r in results if not r["ok"]]
    header = [
        f"# Job watcher {run_date}",
        "",
        f"- New postings: **{len(new)}** ({len(sections[0][1])} in my role)",
        f"- Removed postings: **{len(removed)}** ({len(sections[1][1])} in my role)",
        f"- Open postings: **{sum(1 for r in rows if r['status'] == 'open')}**",
        f"- Sources: **{len(ok)} ok**, **{len(failed)} failed** of {len(results)}",
    ]
    if failed:
        header += ["", "## Failed sources", ""]
        header += [f"- {_md_text(r['name'])} ({_md_text(r.get('employer') or '')}): {_md_text(str(r.get('error') or 'failed'))[:300]}" for r in failed]
    header_text = "\n".join(header) + "\n"

    # Reserve room for every section heading and a possible "…and N more" line.
    def heading(name, items):
        return f"\n## {name} ({len(items)})\n\n"

    reserve = sum(len(heading(n, it)) + 40 for n, it in sections)
    remaining = budget - len(header_text) - reserve
    rendered = []
    for name, items in sections:
        lines = []
        for i, r in enumerate(items):
            line = posting_line(r) + "\n"
            if len(line) > remaining:
                lines.append(f"- …and {len(items) - i} more\n")
                remaining = -1  # once cut, later (lower-priority) sections only get a count
                break
            lines.append(line)
            remaining -= len(line)
        if not items:
            lines.append("_None._\n")
        rendered.append(heading(name, items) + "".join(lines))
    body = header_text + "".join(rendered)
    return body[:MAX_BODY]


# ---------------------------------------------------------------- gh CLI

def _gh(args: list[str], check: bool = True) -> str:
    proc = subprocess.run(["gh", *args], capture_output=True, text=True, encoding="utf-8")
    if check and proc.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args[:2])} failed: {proc.stderr.strip()[:300]}")
    return proc.stdout


def publish_issue(run_date: str, body: str) -> str:
    """Create or update today's issue and close older ones. Returns a message."""
    if not shutil.which("gh"):
        return "issue skipped: gh CLI not found"
    if not (os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")):
        return "issue skipped: no GH_TOKEN/GITHUB_TOKEN"
    title = issue_title(run_date)
    try:
        _gh(["label", "create", LABEL, "--color", "0E8A16", "--description", "Daily job watcher report", "--force"], check=False)
        existing = json.loads(
            _gh(["issue", "list", "--label", LABEL, "--state", "all", "--limit", "200", "--json", "number,title,state"]) or "[]"
        )
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as fh:
            fh.write(body)
            body_file = fh.name
        try:
            today = [i for i in existing if i["title"] == title]
            if today:
                number = today[0]["number"]
                _gh(["issue", "edit", str(number), "--body-file", body_file])
                if today[0]["state"].upper() != "OPEN":
                    _gh(["issue", "reopen", str(number)])
                action = f"updated issue #{number}"
            else:
                url = _gh(["issue", "create", "--title", title, "--body-file", body_file, "--label", LABEL]).strip()
                number = int(url.rstrip("/").rsplit("/", 1)[-1]) if url else None
                action = f"opened issue {url}"
        finally:
            os.unlink(body_file)
        for i in existing:
            if i["state"].upper() == "OPEN" and i["title"] != title and i["title"].startswith(TITLE_PREFIX):
                comment = f"Superseded by #{number}." if number else "Superseded by a newer report."
                _gh(["issue", "close", str(i["number"]), "--comment", comment], check=False)
        return action
    except Exception as exc:  # the issue must never fail the run
        return f"issue failed: {type(exc).__name__}: {exc}"
