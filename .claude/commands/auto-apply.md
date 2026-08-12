---
description: Autonomously scrape, match, fill, and (when approved) submit job applications via Playwright MCP
---

# /auto-apply

Arguments: `$ARGUMENTS`
- No arguments: run across all active companies (`config/companies.json`, filtered to `atsType: greenhouse` and `active: true` in the DB).
- Comma-separated names, e.g. `Stripe, Anthropic`: restrict to those companies.
- `--add "Name" "https://careers-url"`: append a new company to `config/companies.json` (you must confirm it resolves on Greenhouse via `scripts/validate-companies.ts` before scraping it), then continue with the normal run.
- `--approve "Company Name"`: mark a company as reviewed/approved for real submission (writes to `config/run-state.json`) and exit — does not run a scrape/apply pass.

## Safety gate — read this before doing anything else

`config/run-state.json` (create it if missing, shape: `{ "approvedCompanies": string[] }`) tracks which companies the user has reviewed and approved for **real submission**. For any company NOT in `approvedCompanies`:

- Fill the entire application form for real, upload the correct resume, take a screenshot.
- **Do not click Submit.** Record the application with status `ready_for_review`.

For any company that IS in `approvedCompanies`:

- Fill the form, upload the resume, take a screenshot, then click Submit for real, and record status `submitted`.

Never submit for a company that isn't explicitly in `approvedCompanies`. If in doubt, treat it as not approved.

## Steps

1. **Load context.** Read `config/profile.local.json` (if missing, stop and tell the user to fill it in from `config/profile.example.json` — do not fabricate work-authorization/self-ID/salary answers), `config/resumes.json`, `config/answers.template.json`, `config/run-state.json`.

2. **Refresh jobs.** Run `npx tsx scripts/scrape-greenhouse.ts $ARGUMENTS` (pass through any requested company names, empty for all).

3. **Get the eligible queue.** Run `npx tsx scripts/eligible-jobs.ts $ARGUMENTS` — this already applies triple-layer dedup (DB status check, deterministic URL-based dedupeId used later as the `Application.dedupeId` unique key) and resume matching (skips jobs with no category match, no fallback resume). Parse the JSON array from stdout.

4. **For each eligible job**, in order:
   a. Navigate to `job.url` with the Playwright MCP browser tools.
   b. Read the page (accessibility snapshot / `read_page`-equivalent) to find the actual "Apply" link/button if the job URL is a listing page rather than the form directly, and navigate into the application form.
   c. Enumerate every visible form field/question (label text, type: text/textarea/select/radio/checkbox/file).
   d. For each field, resolve its answer:
      - Run `npx tsx scripts/match-question.ts "<field label text>" "<state from job.location, or profile.state if unclear>" [salaryFieldKind] [visibleRangeHigh]` for personal-info, work-auth, self-ID, availability, and salary fields. Use `salaryFieldKind`: `free_text` for open text comp questions, `numeric_with_range` (pass the visible range's high end as the 4th arg) when the field shows a range, `numeric_no_range` for a bare numeric field, `range_selector` for a dropdown/radio of bands.
      - For role-narrative questions (why this company/role, tell me about yourself, strengths/weaknesses, why leaving, technical highlight, management style, conflict resolution, learning approach, D&I, 5-year vision, uniqueness, handling failure, staying current), match the question text to the closest key in `answers.template.json`'s `roleAnswers[job.resumeCategory]` or `generalAnswers`, and lightly adapt the company name into the answer where natural (e.g. "why this company" should reference the actual company).
      - For a country dropdown, use `resolveCountryAlias`-equivalent logic (already encoded in `match-question.ts`'s patterns) to pick the right option text.
      - If a field truly matches nothing (returns `unmatched`) and isn't required, leave it blank. If it's required and unmatched, use your judgment grounded only in resume facts — never invent employment history, degrees, or credentials that aren't in `config/resumeContent.json`.
   e. Fill every field via Playwright MCP `computer`/form-fill actions.
   f. Upload the resume: attach the file at `job.resumePdfPath` (repo-root-relative, e.g. `public/resumes/backend-developer.pdf`) to the file upload field.
   g. Take a screenshot of the completed form. Save it under `public/screenshots/{company-slug}/{dedupeId}.png` (create the directory as needed).
   h. Check `run-state.json` for this company:
      - **Not approved:** stop before Submit. Record the application (see step 5) with `status: "ready_for_review"`.
      - **Approved:** click Submit, wait for the confirmation state, then record with `status: "submitted"`. If submission fails or the confirmation isn't clearly visible, record `status: "failed"` with a `notes` explanation instead of guessing.

5. **Record the result.** For each processed job, upsert an `Application` row (via a small inline Prisma call or a dedicated script — prefer adding one write per job through `prisma.application.create` in a short throwaway `tsx -e` is discouraged by project convention; instead use/extend `scripts/record-application.ts` if present, or create it following the existing scripts' style) with: `jobId`, `resumeVariantId` (look up by category), `dedupeId` (from the eligible-jobs output), `status`, `screenshotPath`, `appliedAt`.

6. **Summarize.** After the run, report: how many jobs were scraped, how many were eligible, how many were skipped (already applied / no resume match), how many are `ready_for_review` vs `submitted` vs `failed`, broken down by company. Point the user at `/applications` in the dashboard (`npm run dev`) to review screenshots and approve companies for real submission next time via `/auto-apply --approve "Company Name"`.

## Notes

- No inline Python. Use the existing TypeScript scripts in `scripts/` or extend them — don't write throwaway inline scripts for logic that belongs in a reusable file.
- Never fabricate resume content, work history, or credentials beyond what's in `config/resumeContent.json` / `config/profile.local.json`.
- If a company's application flow requires account creation, CAPTCHAs, or blocks automated form-filling, stop for that job, record `status: "failed"` with a note, and move to the next job rather than trying to bypass the block.
