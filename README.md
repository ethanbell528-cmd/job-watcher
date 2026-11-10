# Job Watcher

[![Tests](https://github.com/ethanbell528-cmd/job-watcher/actions/workflows/tests.yml/badge.svg)](https://github.com/ethanbell528-cmd/job-watcher/actions/workflows/tests.yml)
[![Daily run](https://github.com/ethanbell528-cmd/job-watcher/actions/workflows/daily.yml/badge.svg)](https://github.com/ethanbell528-cmd/job-watcher/actions/workflows/daily.yml)

A tool that watches the job market for **accounting and finance roles** (accounting and finance
consulting, and the jobs open to an accounting and finance undergraduate with a master's in finance),
with a focus on **New York City, Nashville and Chicago**. Once a day GitHub Actions pulls every open position from 28
employers, compares it with the day before, records what is new and what is gone, opens a GitHub Issue
with the changes, and publishes the result to a website.

Live site: https://ethanbell528-cmd.github.io/job-watcher/

## Title rule

My role is accounting and finance: accounting and finance consulting, and the jobs open to someone with
an accounting and finance undergraduate degree and a master's in finance.

A posting is in my role when its title, ignoring case, passes all three checks:

1. It contains an accounting or finance word: accounting, accountant, accounts payable/receivable,
   audit, auditor, assurance, tax, CPA, SOX, internal controls, bookkeeper, finance, financial, FP&A,
   treasury, budget, valuation, credit, lending, loan, underwriting, investment, banking, banker,
   capital markets, private equity, equity research, portfolio, wealth, asset management, fund, M&A,
   mergers, transaction, deal, due diligence, restructuring, forensic, CFO, economic consulting, or risk.
2. It is not a manager-level or higher job: no manager, director, vice president / VP, principal,
   partner, head, chief, president, controller or "managing" in the title.
3. It is not a technology job: no engineer, developer, architect, software, programmer, cyber, DevOps
   or "data scientist" in the title.

Only the job title is used, nothing else about the posting. Each word is matched as a whole word, so
"Taxonomy Specialist" is not a tax job.

The rule lives in `watcher/role.py`. The three target cities are not part of the rule: the site flags
and filters New York City, Nashville and Chicago postings from the `location` column.

## Commands

Build the history file from the raw files:

```
uv run python -m watcher.build
```

Other commands:

```
uv sync                                  # install dependencies
uv run python -m watcher.run             # the full daily pipeline (fetch, build, status, issue)
uv run python -m watcher.run --no-issue  # same, without touching GitHub Issues
uv run pytest                            # run the tests
```

## Sources

Every board is read through its applicant tracking system's public JSON API with no login. No HTML
pages are read. Every posting a board returns is kept, not only the ones in my role.

| Employer | Source name | ATS | Board | Search term |
|---|---|---|---|---|
| Huron Consulting Group | `huron` | Workday | huron.wd1.myworkdayjobs.com / huroncareers |  |
| Northern Trust | `northern_trust` | Workday | ntrs.wd1.myworkdayjobs.com / northerntrust |  |
| CME Group | `cme_group` | Workday | cmegroup.wd1.myworkdayjobs.com / cme_careers |  |
| Morningstar | `morningstar` | Workday | morningstar.wd5.myworkdayjobs.com / Morningstar |  |
| AllianceBernstein | `alliancebernstein` | Workday | abglobal.wd1.myworkdayjobs.com / alliancebernsteincareers |  |
| Nissan Americas | `nissan` | Workday | alliance.wd3.myworkdayjobs.com / nissanjobs |  |
| Bridgestone Americas | `bridgestone` | Workday | bridgestone.wd5.myworkdayjobs.com / External | `analyst` |
| Guidehouse | `guidehouse` | Workday | guidehouse.wd1.myworkdayjobs.com / External |  |
| FTI Consulting | `fti_consulting` | Workday | fticonsulting.wd108.myworkdayjobs.com / FTIConsultingCareers |  |
| Protiviti | `protiviti` | Workday | roberthalf.wd1.myworkdayjobs.com / ProtivitiNA |  |
| PwC | `pwc` | Workday | pwc.wd3.myworkdayjobs.com / Global_Experienced_Careers |  |
| RSM US | `rsm` | Workday | rsm.wd1.myworkdayjobs.com / RSMCareers |  |
| Crowe | `crowe` | Workday | crowe.wd12.myworkdayjobs.com / External_Careers |  |
| Baker Tilly | `baker_tilly` | Workday | bakertilly.wd5.myworkdayjobs.com / BTCareers |  |
| Ankura Consulting Group | `ankura` | Workday | ankura.wd5.myworkdayjobs.com / Ankura |  |
| Gartner | `gartner` | Workday | gartner.wd5.myworkdayjobs.com / EXT |  |
| Mastercard | `mastercard` | Workday | mastercard.wd1.myworkdayjobs.com / CorporateCareers |  |
| Capital One | `capital_one` | Workday | capitalone.wd12.myworkdayjobs.com / Capital_One |  |
| Capco | `capco` | Greenhouse | capco |  |
| Charles River Associates | `charles_river_associates` | Greenhouse | charlesriverassociates |  |
| Spaulding Ridge | `spaulding_ridge` | Greenhouse | spauldingridge |  |
| Aprio | `aprio` | Lever | Aprio |  |
| Kobie Marketing | `kobie` | Lever | kobie |  |
| Palantir Technologies | `palantir` | Lever | palantir |  |
| Ramp | `ramp` | Ashby | ramp |  |
| DLC (Accounting & Finance Consulting) | `dlc` | Ashby | dlc-inc |  |
| NielsenIQ | `nielseniq` | SmartRecruiters | NielsenIQ |  |
| ServiceNow | `servicenow` | SmartRecruiters | ServiceNow |  |

**Search term.** No board returns more than 5,000 postings. Bridgestone Americas is requested with the
search term `analyst` because its Workday board has about 3,000 postings but cannot be read past the
first 2,000, so a full read is not possible.

Notes on the sources:

- Workday gives no posting date (only text like "Posted 3 Days Ago") and no department, so
  `posted_date` and `department` are empty for Workday rows. Some Workday locations read "2 Locations".
- A source that fails, or returns zero postings, writes no raw file that day, so none of its postings
  are marked removed by a bad day.

## How the pipeline works

1. **Fetch.** Every source is called and what it returns is saved, compressed, in
   `data/raw/<date>/<source>.json.gz`. One source failing does not stop the run. The result of every
   source (ok or failed, count, error) is recorded in `data/raw/<date>/_run.json` and in
   `data/status.json`.
2. **Build.** `data/history.csv` is built from the raw files alone, day by day: first seen, last seen,
   removed (only on a day the posting's source has a raw file and no longer lists it) and reopened.
   Building again gives the same file byte for byte.
3. **Status.** `data/status.json` is written.
4. **Issue.** An Issue titled `Job watcher <date>` lists the new and removed postings with links, and
   the previous day's Issue is closed. It is opened every day, even with no changes.
5. **Commit.** The workflow commits `data/`.

A second run on the same day replaces that day's raw files, builds the history again and updates that
day's Issue, so each day counts once. All dates are UTC.

## Files

Pipeline

| File | What it does |
|---|---|
| `sources.json` | The watch list: one entry per employer with its ATS, board and search term. |
| `watcher/sources.py` | Loads and checks `sources.json`. |
| `watcher/fetch.py` | One fetch function per ATS (Workday, Greenhouse, Lever, Ashby, SmartRecruiters), with paging, retries and timeouts. |
| `watcher/raw.py` | Reads and writes the compressed raw files and the per-day `_run.json`. |
| `watcher/normalize.py` | One converter per ATS that turns a raw file into the common columns. |
| `watcher/role.py` | The title rule (`in_role`). |
| `watcher/build.py` | Builds `data/history.csv` from `data/raw`. |
| `watcher/status.py` | Writes `data/status.json`. |
| `watcher/issue.py` | Builds the daily Issue and opens, updates and closes Issues with the `gh` CLI. |
| `watcher/run.py` | The daily pipeline: fetch, build, status, issue. |
| `watcher/__init__.py` | Marks `watcher` as a Python package. |
| `pyproject.toml`, `uv.lock` | Python project and locked dependencies (requests, pytest). |

Workflows

| File | What it does |
|---|---|
| `.github/workflows/daily.yml` | Runs the pipeline once a day at 11:17 UTC (and on demand) and commits `data/`. |
| `.github/workflows/tests.yml` | Runs the tests on every push and pull request. |

Tests

| File | What it does |
|---|---|
| `tests/test_normalize.py` | Checks the conversion of each of the five sources to the common columns. |
| `tests/test_role.py` | Checks the title rule on titles that should and should not match. |
| `tests/test_build.py` | Checks first seen, last seen, removed, reopened, first-run and the byte-identical rebuild. |
| `tests/test_status_issue.py` | Checks the status counts, the Issue text and the run's exit code. |
| `tests/test_fetch.py` | Checks paging for Workday and SmartRecruiters without the network. |
| `tests/fixtures/*.json` | One sample raw file per ATS used by the tests. |

Data

| File | What it does |
|---|---|
| `data/raw/<date>/<source>.json.gz` | What each source returned that day, unchanged. |
| `data/raw/<date>/_run.json` | The result of every source that day. |
| `data/history.csv` | One row per posting, built from the raw files. |
| `data/status.json` | The latest run: time, counts and the status of every source. |

Site

| File | What it does |
|---|---|
| `index.html`, `assets/js/today.js` | Today page: last run, source status, the four counts, new and removed postings. |
| `browse.html`, `assets/js/browse.js` | Browse page: open postings with role switch, filters, search, sort, apply links and a starred shortlist. |
| `market.html`, `assets/js/market.js` | Market page: six report sections computed in the browser from `data/history.csv`. |
| `assets/js/core.js` | Shared calculations: CSV parser, dates, city matching and the Market metrics. |
| `assets/js/app.js` | Shared page code: navigation, data loading, posting cards, logos, shortlist. |
| `assets/js/charts.js` | The charts, drawn as SVG with no outside libraries. |
| `assets/css/style.css` | The one stylesheet all pages share. |
| `assets/logos/<source>.png` | Employer logo shown next to each posting. |
| `assets/icons/*.png` | App icons. |
| `manifest.webmanifest` | Web app manifest, so the site installs as an app. |
| `sw.js` | Service worker: loads data from the network when online and shows the last loaded data when offline. |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are. |
| `.gitattributes`, `.gitignore` | Keep line endings stable and keep local files out of the repository. |

Employer names and logos belong to their owners and are shown only to identify each employer's postings.

Built with Claude Code.
