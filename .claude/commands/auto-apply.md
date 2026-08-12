---
description: Scrape/discover jobs, fill applications via the script-driven ATS engine, and (when approved) submit
---

# /auto-apply

Arguments: `$ARGUMENTS`

This command is intentionally thin — the fill mechanics run in `scripts/run-auto-apply.ts` (a plain Node script using `lib/ats/engine.ts`, zero LLM tokens per field). Your job is to route arguments and report the result, not to drive the browser yourself.

## Routing

- `--add "Name" "https://careers-url" [--ats greenhouse|lever|ashby]` → run `npx tsx scripts/manage-companies.ts --add "Name" "https://careers-url" [--ats ...]`, report the result, stop.
- `--approve "Company Name"` / `--unapprove "Company Name"` → run `npx tsx scripts/manage-companies.ts --approve|--unapprove "Company Name"`, report the result, stop.
- `--unblock "Company Name"` → run `npx tsx scripts/manage-companies.ts --unblock "Company Name"`, report the result, stop.
- Otherwise (no args, or a comma-separated company list, optionally with `--limit N` / `--max-minutes N`): proceed with the full run below.

## Full run

1. **Check the profile exists.** If `config/profile.local.json` is missing, stop and tell the user to `cp config/profile.example.json config/profile.local.json` and fill in real values — never fabricate work-authorization/self-ID/salary answers.

2. **Broad discovery (bounded, cheap, both markets).** Call the JobDataLake MCP `search_jobs` tool a small number of times — roughly one call per resume category in `config/resumes.json` for the **US** market (`countries: "US"`, `sort_by: "posted_at:desc"`, salary floor from `config/profile.local.json`'s state-tier `DEFAULT.low`), plus one call per category for the **India** market (`countries: "IN"`, `salary_min` ≈ 24000 — the USD-equivalent of the 20 LPA floor, since JobDataLake normalizes salary to USD). Set `country: "US"` / `country: "IN"` explicitly on each imported job (don't rely on re-inferring it) and `postedAt` from whatever posting-date the tool surfaces. If a call errors (session/auth issue), skip discovery for this run rather than blocking the whole command — the curated scrapers still cover Greenhouse/Lever/Ashby. This is O(query count), not O(job count) — do not call it per job. Pipe the combined results into `npx tsx scripts/import-jobs.ts` (temp file per that script's documented interface, including `postedAt`/`country` per job) so they land in the `Job` table tagged `source: "jobdatalake"` alongside the curated per-company scrapes.

3. **Run the engine.** `npx tsx scripts/run-auto-apply.ts $ARGUMENTS` (pass through company names / `--limit` / `--max-minutes` as given). This single script call does everything: scrapes Greenhouse/Lever/Ashby for the requested companies (with retry/backoff on rate limits), computes the priority-ranked eligible queue, runs the fill engine per job with a few seconds of randomized pacing between applications (bot-wall/CAPTCHA detection, multi-step forms, combobox handling, the per-company circuit breaker, a per-job retry cap for non-transient failures, hard timeouts — all handled inside the script, not by you), records every `Application` row, and prints a JSON summary to stdout.

   **The country/quality filter is the single most important rule in this pipeline (`lib/eligibleJobs.ts`) — do not weaken or route around it:** USA is the only market considered unless the USA pipeline can't fill the daily target (default 20, or the `--limit` given) on its own. A USA job only qualifies if its resume match is ≥50% (`matchResumeScored` raw score ≥100) **and** it was posted within the last 7 days. Only when the qualifying USA pool is short of the target does India get pulled in as a fallback, and only India postings paying ≥20 LPA (verified salary data required — a India job with no salary listed is excluded, never assumed to qualify) count. Every job that fails these gates is excluded outright (tallied in `stats.excludedByFilter`), not silently downgraded to `manual_apply_needed`.

4. **Report the summary** to the user in plain language: total scanned, how many were excluded by the country/quality/salary gate, the US-vs-India-fallback split (`usTargeted`/`indiaFallbackTargeted`), how many were fillable vs `manual_apply_needed` (unsupported ATS — Workday and similar), the breakdown by status (`ready_for_review` / `submitted` / `failed`) and by company, any company the circuit breaker just blocked (3 consecutive bot-detection/timeout/stuck-form failures) so the user knows to investigate manually via `--unblock` later, and any `recurringUnmatchedQuestions` in the summary (the same required question showing up across multiple postings — suggest the user add a real answer to `config/answers.template.json`). Point them at `/applications` in the dashboard (`npm run dev`) to review screenshots, and remind them that nothing gets submitted for a company until they run `/auto-apply --approve "Company Name"`.

## Hard rules (unchanged from before)

- Never attempt to bypass a CAPTCHA or bot-detection wall — the engine already detects and skips these; don't try to work around it yourself if you're inspecting a failed job manually.
- Never fabricate resume content, work history, or credentials beyond what's in `config/resumeContent.json` / `config/profile.local.json`.
- Non-Greenhouse/Lever/Ashby ATS (Workday, custom enterprise systems) are `manual_apply_needed` by design — do not attempt to automate them, even ad hoc.
- No inline Python. Use/extend the existing TypeScript scripts.
