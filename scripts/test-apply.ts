/**
 * Fast smoke test for the fill engine — runs against one real, known job URL
 * per supported ATS in dry-run mode (submit: false always, regardless of
 * run-state.json) and reports field-match coverage/timing/pass-fail per
 * platform. Writes no DB rows. Safe to re-run while iterating on selectors.
 *
 * CLI: npx tsx scripts/test-apply.ts [greenhouse|lever|ashby ...]
 */
import { chromium } from "playwright";
import { prisma } from "../lib/db";
import { runJob } from "../lib/ats/engine";
import { join } from "path";

async function pickSampleJob(atsType: string) {
  return prisma.job.findFirst({
    where: { company: { atsType, active: true } },
    orderBy: { scrapedAt: "desc" },
  });
}

async function main() {
  const requested = process.argv.slice(2);
  const atsTypes = requested.length > 0 ? requested : ["greenhouse", "lever", "ashby"];

  const browser = await chromium.launch();
  const results: { ats: string; title?: string; status: string; elapsedMs: number; notes?: string }[] = [];

  for (const ats of atsTypes) {
    const job = await pickSampleJob(ats);
    if (!job) {
      results.push({ ats, status: "no_sample_job_found", elapsedMs: 0 });
      continue;
    }

    const result = await runJob(browser, {
      jobUrl: job.url,
      resumePdfPath: join(process.cwd(), "public/resumes/software-engineer.pdf"),
      resumeCategory: "software-engineer",
      screenshotPath: join(process.cwd(), "public/screenshots/_test", `${ats}-test.png`),
      submit: false, // test-apply never submits, regardless of run-state.json
    });

    results.push({ ats, title: job.title, status: result.status, elapsedMs: result.elapsedMs, notes: result.notes });
  }

  await browser.close();

  console.log("\nField-fill smoke test results:\n");
  for (const r of results) {
    const pass = r.status === "ready_for_review" || r.status === "submitted";
    console.log(`${pass ? "✓" : "✗"} ${r.ats} — ${r.title ?? "(no sample)"} [${r.status}, ${r.elapsedMs}ms]`);
    if (r.notes) console.log(`    ${r.notes}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
