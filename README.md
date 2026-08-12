# jobify-agent

Autonomous job application system: scrapes open roles from Greenhouse-hosted companies, matches each job to a tailored resume, fills out the application form with pre-written answers via browser automation, and tracks everything in a dashboard.

## Stack

- Next.js 14 (App Router, TypeScript) — dashboard at `/`, `/applications`, `/resumes`, `/profile`
- Prisma + SQLite — local `prisma/dev.db`
- Playwright — resume PDF rendering (`scripts/build-resume-variants.ts`) and, via `@playwright/mcp`, the actual browser automation Claude Code drives during `/auto-apply`
- Claude Code slash command `/auto-apply` — orchestrates scrape → match → fill → (approved) submit

## Setup

```bash
npm install
npx prisma migrate dev
npx tsx scripts/validate-companies.ts   # probes candidates against the Greenhouse public API, seeds Company table
npx tsx scripts/seed-resumes.ts         # registers resume variants in the DB
npx tsx scripts/build-resume-variants.ts # renders resumes/*.pdf → public/resumes/*.pdf (1-page, link-checked)
cp config/profile.example.json config/profile.local.json  # fill in real values — gitignored, never committed
npm run dev
```

## Running auto-apply

Inside Claude Code:

```
/auto-apply                      # all active Greenhouse companies
/auto-apply Stripe, Anthropic    # specific companies
/auto-apply --add "Ramp" "https://ramp.com/careers"
/auto-apply --approve "Stripe"   # mark a company reviewed — future runs submit for real there
```

**Safety gate:** any company not yet listed in `config/run-state.json`'s `approvedCompanies` gets a dry run only — the form is filled and screenshotted but never submitted. Review screenshots and application rows on `/applications`, then approve a company to let future runs submit for real.

## Key scripts

| Script | Purpose |
|---|---|
| `scripts/validate-companies.ts` | Probes `config/companies.json` candidates against the Greenhouse boards API, seeds `Company` |
| `scripts/scrape-greenhouse.ts` | Pulls/upserts jobs for active Greenhouse companies |
| `scripts/eligible-jobs.ts` | Applies dedup + resume matching, returns the queue `/auto-apply` processes |
| `scripts/build-resume-variants.ts` | Renders `config/resumeContent.json` → 3 tailored 1-page PDFs, verifies page count + links |
| `scripts/record-application.ts` | Upserts an `Application` row after a job is processed |
| `lib/matchResume.ts` | Keyword-scored resume matching, no fallback (skip rather than send the wrong resume) |
| `lib/matchQuestion.ts` | ATS question text → profile/answer field, incl. state-tiered salary rules |

## Personal data

`config/profile.local.json` (real contact info, work authorization, self-identification, salary tiers) is gitignored and never committed. `config/profile.example.json` is the template. `config/answers.template.json` holds AI-drafted role/general Q&A grounded in the resume — review and edit freely.
