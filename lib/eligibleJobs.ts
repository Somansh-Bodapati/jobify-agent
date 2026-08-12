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
  postedAt: string | null;
};

function payScore(salaryMin: number | null, salaryMax: number | null, targetHigh: number): number {
  if (salaryMax == null && salaryMin == null) return 0;
  const jobHigh = salaryMax ?? salaryMin ?? 0;
  return jobHigh >= targetHigh ? 2 : jobHigh >= targetHigh * 0.85 ? 1 : 0;
}

function sponsorshipScore(signal: string | null): number {
  // Scaled up from the original -3/0/+1: at that magnitude a hard "no
  // sponsorship" signal was negligible next to a 0-300 match score and
  // barely deprioritized anything. -30/+5 actually moves the needle without
  // being able to fully cancel out a strong match on its own.
  if (signal === "no_sponsorship") return -30;
  if (signal === "mentions_sponsorship") return 5;
  return 0;
}

/**
 * Bounded freshness bonus — a tie-breaker among comparable matches, never an
 * override of a real match-quality gap. Capped at 40, well below what even a
 * single extra matched keyword is typically worth (15-40) let alone a title
 * match (+50) — so a fresh weak match cannot leapfrog a meaningfully better
 * older match, but two similar-match jobs reorder toward the fresher one.
 * Window sizes follow the "first 5 days matter most" pattern from
 * job-application response-rate research; null postedAt (pre-dates the field,
 * or a source that doesn't provide one) is neutral, not penalized.
 */
function recencyBonus(postedAt: Date | null): number {
  if (!postedAt) return 0;
  const hours = (Date.now() - postedAt.getTime()) / 3_600_000;
  if (hours < 0) return 0; // clock skew / bad data — don't reward
  if (hours <= 24) return 40;
  if (hours <= 72) return 25;
  if (hours <= 24 * 5) return 12;
  if (hours <= 24 * 14) return 4;
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
    const alreadyApplied = job.applications.some(
      (a) =>
        ["submitted", "ready_for_review", "manual_apply_needed"].includes(a.status) || a.permanentlySkipped
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
      match.score +
      payScore(job.salaryMin, job.salaryMax, tier.high) * 25 +
      sponsorshipScore(job.sponsorshipSignal) +
      recencyBonus(job.postedAt);

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
      postedAt: job.postedAt?.toISOString() ?? null,
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
