/**
 * Returns jobs that are eligible for /auto-apply: not already applied to
 * (Application exists with status submitted/ready_for_review — dedup layer 1),
 * and that match a resume category (skip entirely otherwise — no fallback resume).
 * Outputs JSON to stdout for the /auto-apply command to consume.
 *
 * CLI: npx tsx scripts/eligible-jobs.ts [CompanyName, CompanyName2, ...] [--limit N]
 */
import { prisma } from "../lib/db";
import { matchResume, loadResumeConfigs } from "../lib/matchResume";
import { dedupeIdFromUrl } from "../lib/dedupe";

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;
  const namesArgs = (limitIdx >= 0 ? args.slice(0, limitIdx) : args).join(" ");
  const requestedNames = namesArgs.split(",").map((s) => s.trim()).filter(Boolean);

  const jobs = await prisma.job.findMany({
    where: {
      company: {
        active: true,
        ...(requestedNames.length > 0 ? { name: { in: requestedNames } } : {}),
      },
    },
    include: { company: true, applications: true },
  });

  const resumes = loadResumeConfigs();
  const eligible: {
    jobId: string;
    company: string;
    title: string;
    url: string;
    location: string | null;
    dedupeId: string;
    resumeCategory: string;
    resumePdfPath: string;
  }[] = [];

  let skippedApplied = 0;
  let skippedNoMatch = 0;

  for (const job of jobs) {
    const alreadyApplied = job.applications.some((a) =>
      ["submitted", "ready_for_review"].includes(a.status)
    );
    if (alreadyApplied) {
      skippedApplied++;
      continue;
    }

    const resume = matchResume(job.title, job.description ?? "", resumes);
    if (!resume) {
      skippedNoMatch++;
      continue;
    }

    eligible.push({
      jobId: job.id,
      company: job.company.name,
      title: job.title,
      url: job.url,
      location: job.location,
      dedupeId: dedupeIdFromUrl(job.url),
      resumeCategory: resume.category,
      resumePdfPath: resume.pdfPath,
    });
  }

  const limited = limit ? eligible.slice(0, limit) : eligible;

  console.error(
    `[eligible-jobs] ${jobs.length} scanned | ${skippedApplied} already applied | ${skippedNoMatch} no resume match | ${eligible.length} eligible${limit ? ` (returning first ${limited.length})` : ""}`
  );
  console.log(JSON.stringify(limited, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
