/**
 * Main /auto-apply entrypoint. Scrapes (Greenhouse/Lever/Ashby), pulls the
 * priority-ranked eligible queue, runs the fill engine per job, records
 * results, and prints a JSON summary. Zero LLM tokens spent on the fill loop
 * itself — this is a plain script, safe to run directly for testing.
 *
 * CLI: npx tsx scripts/run-auto-apply.ts [CompanyName, CompanyName2, ...] [--limit N] [--max-minutes N]
 */
import { chromium } from "playwright";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/db";
import { getEligibleJobs } from "../lib/eligibleJobs";
import { runJob } from "../lib/ats/engine";
import type { JobResult } from "../lib/ats/types";
import { reportRecurringUnmatchedQuestions } from "../lib/unmatchedQuestions";
import { generateTailoredResume } from "../lib/generateTailoredResume";

const CIRCUIT_BREAKER_THRESHOLD = 3;
const RETRY_CAP = 3;
const NON_TRANSIENT_FAILURE_REASONS = new Set(["bot_detection", "unsupported_ats"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Small randomized delay between applications so a run doesn't look like a
 * bot hammering the same company back-to-back — 3-8s. */
function humanPaceDelay() {
  return sleep(3000 + Math.random() * 5000);
}

function loadApprovedCompanies(): Set<string> {
  const path = join(process.cwd(), "config/run-state.json");
  if (!existsSync(path)) return new Set();
  const state = JSON.parse(readFileSync(path, "utf-8")) as { approvedCompanies: string[] };
  return new Set(state.approvedCompanies ?? []);
}

async function recordApplication(input: {
  jobId: string;
  resumeCategory?: string;
  dedupeId: string;
  status: string;
  screenshotPath?: string;
  notes?: string;
  failureReason?: string;
}) {
  const resumeVariant = input.resumeCategory
    ? await prisma.resumeVariant.findUnique({ where: { category: input.resumeCategory } })
    : null;
  const application = await prisma.application.upsert({
    where: { dedupeId: input.dedupeId },
    update: {
      status: input.status,
      screenshotPath: input.screenshotPath ?? null,
      notes: input.notes ?? null,
      attempts: { increment: 1 },
    },
    create: {
      jobId: input.jobId,
      resumeVariantId: resumeVariant?.id ?? null,
      dedupeId: input.dedupeId,
      status: input.status,
      screenshotPath: input.screenshotPath ?? null,
      notes: input.notes ?? null,
      attempts: 1,
    },
  });

  // Retry cap: a job that keeps failing for a non-transient reason (bot
  // detection, unsupported ATS) after RETRY_CAP attempts is permanently
  // skipped rather than retried forever. Transient failures (timeout,
  // navigation_error) keep retrying indefinitely — that's just bad luck.
  if (
    input.status === "failed" &&
    input.failureReason &&
    NON_TRANSIENT_FAILURE_REASONS.has(input.failureReason) &&
    application.attempts >= RETRY_CAP
  ) {
    await prisma.application.update({
      where: { dedupeId: input.dedupeId },
      data: { permanentlySkipped: true },
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;
  const maxMinutesIdx = args.indexOf("--max-minutes");
  const maxMinutes = maxMinutesIdx >= 0 ? Number(args[maxMinutesIdx + 1]) : undefined;
  const flagIndices = [limitIdx, maxMinutesIdx].filter((i) => i >= 0);
  const firstFlagIdx = flagIndices.length > 0 ? Math.min(...flagIndices) : args.length;
  const namesArgs = args.slice(0, firstFlagIdx).join(" ");
  const requestedNames = namesArgs.split(",").map((s) => s.trim()).filter(Boolean);
  const nameArgStr = requestedNames.join(", ");

  console.error("[run-auto-apply] Scraping...");
  for (const scraper of ["scrape-greenhouse", "scrape-lever", "scrape-ashby"]) {
    try {
      execSync(`npx tsx scripts/${scraper}.ts ${JSON.stringify(nameArgStr)}`, { stdio: "inherit" });
    } catch {
      console.error(`[run-auto-apply] ${scraper} failed, continuing`);
    }
  }

  const { fillable, manualApplyNeeded, stats } = await getEligibleJobs(requestedNames, limit);
  console.error(
    `[run-auto-apply] ${stats.scanned} scanned | ${stats.excludedByFilter} excluded (country/quality/salary) | ${fillable.length} fillable (${stats.usCount} US, ${stats.indiaCount} India fallback) | ${manualApplyNeeded.length} manual-apply-needed`
  );

  // Record manual-apply-needed jobs once so they surface in the dashboard and aren't rescanned every run.
  for (const job of manualApplyNeeded) {
    await recordApplication({
      jobId: job.jobId,
      resumeCategory: job.resumeCategory,
      dedupeId: job.dedupeId,
      status: "manual_apply_needed",
      notes: `Matched ${job.resumeCategory} but ATS isn't automated — apply manually.`,
    });
  }

  const approvedCompanies = loadApprovedCompanies();
  const deadline = maxMinutes ? Date.now() + maxMinutes * 60_000 : null;
  const browser = await chromium.launch();

  const outcomes: { company: string; title: string; status: string; country: string; failureReason?: string }[] = [];
  const consecutiveFailuresByCompany = new Map<string, number>();
  const blockedThisRun = new Set<string>();

  for (const job of fillable) {
    if (deadline && Date.now() > deadline) {
      console.error("[run-auto-apply] max-minutes budget spent, stopping (remaining jobs will run next invocation)");
      break;
    }
    if (blockedThisRun.has(job.companySlug)) continue;

    const screenshotPath = join(
      process.cwd(),
      "public/screenshots",
      job.companySlug,
      `${job.dedupeId}.png`
    );
    mkdirSync(join(process.cwd(), "public/screenshots", job.companySlug), { recursive: true });

    // Per-JD tailoring: reorder (never rewrite) the base resume's bullets by
    // relevance to this job's title/description. Falls back to the static
    // pre-built category PDF on any failure — never blocks the application.
    let resumePdfPath = join(process.cwd(), job.resumePdfPath);
    try {
      const tailoredDir = join(process.cwd(), "public/resumes/tailored", job.companySlug);
      mkdirSync(tailoredDir, { recursive: true });
      const tailoredPath = join(tailoredDir, `${job.dedupeId}.pdf`);
      await generateTailoredResume(browser, job.resumeCategory, job.title, job.description ?? "", tailoredPath);
      resumePdfPath = tailoredPath;
    } catch (err) {
      console.error(`[run-auto-apply] tailored resume generation failed for "${job.title}" — using static ${job.resumeCategory}.pdf instead: ${err instanceof Error ? err.message : err}`);
    }

    const result: JobResult = await runJob(browser, {
      jobUrl: job.url,
      resumePdfPath,
      resumeCategory: job.resumeCategory,
      state: job.location ?? undefined,
      screenshotPath,
      submit: approvedCompanies.has(job.company),
      atsType: job.atsType as import("../lib/ats/types").AtsType,
    });

    await recordApplication({
      jobId: job.jobId,
      resumeCategory: job.resumeCategory,
      dedupeId: job.dedupeId,
      status: result.status,
      screenshotPath: result.screenshotPath ? `public/screenshots/${job.companySlug}/${job.dedupeId}.png` : undefined,
      notes: result.notes,
      failureReason: result.failureReason,
    });

    outcomes.push({ company: job.company, title: job.title, status: result.status, country: job.country, failureReason: result.failureReason });

    await humanPaceDelay();

    // Circuit breaker: bot detection / timeout / stuck-form count as consecutive failures per company.
    const isBreakerFailure =
      result.status === "failed" &&
      ["bot_detection", "timeout", "form_did_not_progress"].includes(result.failureReason ?? "");
    const prevCount = consecutiveFailuresByCompany.get(job.companySlug) ?? 0;
    const newCount = isBreakerFailure ? prevCount + 1 : 0;
    consecutiveFailuresByCompany.set(job.companySlug, newCount);

    if (newCount >= CIRCUIT_BREAKER_THRESHOLD) {
      await prisma.company.update({
        where: { slug: job.companySlug },
        data: { blocked: true, consecutiveFailures: newCount, lastFailureReason: result.failureReason },
      });
      blockedThisRun.add(job.companySlug);
      console.error(`[run-auto-apply] ${job.company}: ${newCount} consecutive failures, blocking for this run and future runs`);
    } else {
      await prisma.company.update({
        where: { slug: job.companySlug },
        data: { consecutiveFailures: newCount, lastFailureReason: isBreakerFailure ? result.failureReason : null },
      });
    }
  }

  await browser.close();

  const recurringUnmatchedQuestions = await reportRecurringUnmatchedQuestions();

  const summary = {
    scanned: stats.scanned,
    excludedByFilter: stats.excludedByFilter,
    processed: outcomes.length,
    usTargeted: stats.usCount,
    indiaFallbackTargeted: stats.indiaCount,
    manualApplyNeeded: manualApplyNeeded.length,
    byStatus: outcomes.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {}),
    byCountry: outcomes.reduce<Record<string, number>>((acc, o) => {
      acc[o.country] = (acc[o.country] ?? 0) + 1;
      return acc;
    }, {}),
    byCompany: outcomes.reduce<Record<string, number>>((acc, o) => {
      acc[o.company] = (acc[o.company] ?? 0) + 1;
      return acc;
    }, {}),
    blockedThisRun: [...blockedThisRun],
    recurringUnmatchedQuestions,
    outcomes,
  };

  const logDir = join(process.cwd(), "logs");
  mkdirSync(logDir, { recursive: true });
  writeFileSync(join(logDir, `auto-apply-${Date.now()}.json`), JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
