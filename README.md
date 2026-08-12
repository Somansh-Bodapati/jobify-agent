# jobify-agent

Autonomous job application system: discovers open roles across Greenhouse, Lever, and Ashby (plus broad discovery via JobDataLake), matches each job to a tailored resume, fills out the application form, and tracks everything in a dashboard. Non-automatable ATS platforms (Workday, other custom enterprise systems) are detected and marked for manual application rather than guessed at.

## Stack

- Next.js 14 (App Router, TypeScript) — dashboard at `/`, `/applications`, `/resumes`, `/profile`
- Prisma + SQLite — local `prisma/dev.db`
- `lib/ats/engine.ts` — a plain TypeScript/Playwright fill engine (no MCP, no LLM tokens per field): detects the ATS, scans the DOM, fills native inputs/selects/react-select comboboxes/button-groups, handles multi-step forms, screenshots, submits only when approved
- Claude Code slash command `/auto-apply` — thin orchestrator: routes flags, runs a small bounded JobDataLake discovery pass, then calls `scripts/run-auto-apply.ts` and reports its summary

## Setup

```bash
npm install
npm run setup   # migrate, validate companies across Greenhouse/Lever/Ashby, seed + build resume variants
cp config/profile.example.json config/profile.local.json  # fill in real values — gitignored, never committed
npm run dev
```

## Running auto-apply

```bash
npm run apply                          # all active companies, dry-run unless approved
npm run apply -- "Stripe, Vercel"      # specific companies
npm run apply -- --limit 5 --max-minutes 20
npx tsx scripts/manage-companies.ts --add "Name" "https://careers-url" [--ats greenhouse|lever|ashby]
npx tsx scripts/manage-companies.ts --approve "Company Name"      # future runs submit for real there
npx tsx scripts/manage-companies.ts --unblock "Company Name"      # reset the circuit breaker
npm run test:apply                     # smoke test the fill engine against one real job per ATS, dry-run only
```

Or, inside Claude Code, `/auto-apply` (same routing, plus a JobDataLake discovery pass first).

**Safety gate:** any company not in `config/run-state.json`'s `approvedCompanies` gets a dry run only — the form is filled and screenshotted but never submitted. Review screenshots and application rows on `/applications`, then approve a company for real submission.

**Circuit breaker:** after 3 consecutive bot-detection/timeout/stuck-form failures for a company in one run, it's marked `blocked` and skipped (this run and future runs) until manually unblocked — surfaced on the dashboard.

## Supported ATS / what's automated

| ATS | Scrape | Fill | Notes |
|---|---|---|---|
| Greenhouse | ✅ public boards API | ✅ | react-select comboboxes handled |
| Lever | ✅ public postings API | ✅ | many Lever deployments run hCaptcha — detected and skipped, never bypassed |
| Ashby | ✅ public job-board API | ✅ | includes Yes/No button-group questions |
| Workday / other custom ATS | — | — | detected via `lib/ats/detect.ts`, recorded `manual_apply_needed` |

Bot-walls (Cloudflare challenges, hCaptcha, reCAPTCHA challenge frames) and cookie-consent banners are detected and handled (banners dismissed preferring "reject"; bot-walls skipped, never bypassed). Companies that embed their ATS form in an iframe on their own branded domain (e.g. Databricks embeds Greenhouse) are detected and navigated to directly. Required questions the engine can't confidently answer are left blank and the application is held as `ready_for_review` with the specific unmatched questions listed, rather than guessed.

## Country/quality filter and resume tailoring

**The single most important filter**: USA is the only market considered unless the qualifying USA pipeline (resume match ≥50%, posted within 7 days) can't fill the daily target (default 20, or `--limit`) on its own — only then does India get pulled in as a fallback, gated on a verified ≥20 LPA salary (`lib/eligibleJobs.ts`, `lib/geo.ts`). Jobs failing the gate are excluded outright, tracked in `stats.excludedByFilter`.

Each application gets a **per-job tailored resume** (`lib/resumeTailor.ts` + `lib/generateTailoredResume.ts`): the base resume's real bullets are reordered (never rewritten or invented) by relevance to that specific job's title/description, rendered, and verified 1-page/links-intact — falling back to the static category PDF on any failure. Four categories: software-engineer, frontend, backend-developer, ai-engineer.

## Key scripts

| Script | Purpose |
|---|---|
| `scripts/setup.ts` | One-command bootstrap (migrate, validate, seed, build resumes) |
| `scripts/validate-companies.ts` | Probes each `config/companies.json` candidate on its hinted ATS, falls back to the other two on failure, seeds `Company`. Writes `logs/validation-fallback-matches.json` (matched on an unhinted platform — verify once) and `logs/validation-unresolved.json` (resolved nowhere, with per-company next-step guidance) every run — nothing just silently disappears |
| `scripts/scrape-greenhouse.ts` / `scrape-lever.ts` / `scrape-ashby.ts` | Per-platform job scrapers, upsert-with-dedup |
| `scripts/import-jobs.ts` | Imports broadly-discovered jobs (e.g. from JobDataLake) into the same `Job` table |
| `scripts/eligible-jobs.ts` | Dedup + resume matching + priority ranking (match score, pay-vs-target, sponsorship signal) |
| `scripts/run-auto-apply.ts` | Main entrypoint: scrape → eligible queue → fill engine per job → record → circuit breaker → JSON summary |
| `scripts/manage-companies.ts` | `--add` / `--approve` / `--unapprove` / `--unblock` |
| `scripts/test-apply.ts` | Dry-run smoke test of the fill engine, one job per ATS, no DB writes |
| `scripts/build-resume-variants.ts` | Renders `config/resumeContent.json` → 4 static category 1-page PDFs (the tailoring fallback), verifies page count + links |
| `scripts/unmatched-questions-report.ts` | Recurring unmatched required questions across applications — a nudge to add real answers |
| `lib/ats/engine.ts` | Core fill orchestration: navigate, detect blockers/ATS/cookie banners, fill, multi-step, submit-if-approved |
| `lib/eligibleJobs.ts` | Dedup + resume matching + country/quality gate + USA-first/India-fallback quota + priority ranking |
| `lib/geo.ts` | Classifies a job's country (US/IN/OTHER/UNKNOWN) from location + description text |
| `lib/resumeTailor.ts` | Deterministic per-JD bullet reordering by tag relevance — no LLM, no fabrication risk |
| `lib/matchResume.ts` | Keyword-scored resume matching, no fallback (skip rather than send the wrong resume) |
| `lib/matchQuestion.ts` | ATS question text → profile/answer field, incl. state-tiered salary rules |

## Personal data

`config/profile.local.json` (real contact info, work authorization, self-identification, salary tiers) is gitignored and never committed. `config/profile.example.json` is the template. `config/answers.template.json` holds AI-drafted role/general Q&A grounded in the resume — review and edit freely. Screenshots (`public/screenshots/<company-slug>/<dedupeId>.png`) and run logs (`logs/`) are also gitignored since they can contain personal form data — the `/applications` dashboard page shows a clickable thumbnail of each application's screenshot directly, so you don't need to dig through the filesystem to review one.
