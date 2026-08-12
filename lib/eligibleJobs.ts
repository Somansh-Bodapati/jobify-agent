import { prisma } from "./db";
import { matchResumeScored, loadResumeConfigs } from "./matchResume";
import { dedupeIdFromUrl } from "./dedupe";
import { loadProfile, salaryTierForState } from "./profile";

const SUPPORTED_ATS = new Set(["greenhouse", "lever", "ashby"]);

export type EligibleJob = {
  jobId: string;
  company: string;
  companySlug: string;
  title: string;
  url: string;
  location: string | null;
  dedupeId: string;
  resumeCategory: string;
  resumePdfPath: string;
  priorityScore: number;
};

function payScore(salaryMin: number | null, salaryMax: number | null, targetHigh: number): number {
  if (salaryMax == null && salaryMin == null) return 0;
  const jobHigh = salaryMax ?? salaryMin ?? 0;
  return jobHigh >= targetHigh ? 2 : jobHigh >= targetHigh * 0.85 ? 1 : 0;
}

function sponsorshipScore(signal: string | null): number {
  if (signal === "no_sponsorship") return -3;
  if (signal === "mentions_sponsorship") return 1;
  return 0;
}

export async function getEligibleJobs(
  requestedNames: string[],
  limit?: number
): Promise<{
  fillable: EligibleJob[];
  manualApplyNeeded: EligibleJob[];
  stats: { scanned: number; skippedApplied: number; skippedNoMatch: number };
}> {
  const profile = loadProfile();

  const jobs = await prisma.job.findMany({
    where: {
      company: {
        active: true,
        blocked: false,
        ...(requestedNames.length > 0 ? { name: { in: requestedNames } } : {}),
      },
    },
    include: { company: true, applications: true },
  });

  const resumes = loadResumeConfigs();
  const fillable: EligibleJob[] = [];
  const manualApplyNeeded: EligibleJob[] = [];

  let skippedApplied = 0;
  let skippedNoMatch = 0;

  for (const job of jobs) {
    const alreadyApplied = job.applications.some((a) =>
      ["submitted", "ready_for_review", "manual_apply_needed"].includes(a.status)
    );
    if (alreadyApplied) {
      skippedApplied++;
      continue;
    }

    const match = matchResumeScored(job.title, job.description ?? "", resumes);
    if (!match) {
      skippedNoMatch++;
      continue;
    }

    const tier = salaryTierForState(profile, job.location ?? profile.state);
    const score =
      match.score + payScore(job.salaryMin, job.salaryMax, tier.high) * 25 + sponsorshipScore(job.sponsorshipSignal);

    const entry: EligibleJob = {
      jobId: job.id,
      company: job.company.name,
      companySlug: job.company.slug,
      title: job.title,
      url: job.url,
      location: job.location,
      dedupeId: dedupeIdFromUrl(job.url),
      resumeCategory: match.resume.category,
      resumePdfPath: match.resume.pdfPath,
      priorityScore: score,
    };

    if (SUPPORTED_ATS.has(job.company.atsType)) fillable.push(entry);
    else manualApplyNeeded.push(entry);
  }

  fillable.sort((a, b) => b.priorityScore - a.priorityScore);
  manualApplyNeeded.sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    fillable: limit ? fillable.slice(0, limit) : fillable,
    manualApplyNeeded,
    stats: { scanned: jobs.length, skippedApplied, skippedNoMatch },
  };
}
