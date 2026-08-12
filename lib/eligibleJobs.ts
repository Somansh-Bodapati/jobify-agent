import { prisma } from "./db";
import { matchResumeScored, loadResumeConfigs } from "./matchResume";
import { dedupeIdFromUrl } from "./dedupe";
import { loadProfile, salaryTierForState } from "./profile";

const SUPPORTED_ATS = new Set(["greenhouse", "lever", "ashby"]);

// --- Country-priority quota: the user's top-priority filter ---
// USA is the primary market. India is a fallback ONLY when today's USA
// pipeline (after quality gates) can't fill the daily target on its own.
const DAILY_TARGET = 20;
const MATCH_PERCENT_THRESHOLD = 50; // raw matchResumeScored score >= 100 (see matchPercent below)
const FRESHNESS_DAYS = 7;
const INR_PER_USD = 83; // approximate, documented — not a live FX rate
const INDIA_SALARY_FLOOR_INR = 2_000_000; // 20 LPA
const INDIA_SALARY_FLOOR_USD = Math.round(INDIA_SALARY_FLOOR_INR / INR_PER_USD);

export type EligibleJob = {
  jobId: string;
  company: string;
  companySlug: string;
  atsType: string;
  title: string;
  description: string | null;
  url: string;
  location: string | null;
  country: string;
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
  if (signal === "no_sponsorship") return -30;
  if (signal === "mentions_sponsorship") return 5;
  return 0;
}

function recencyBonus(postedAt: Date | null): number {
  if (!postedAt) return 0;
  const hours = (Date.now() - postedAt.getTime()) / 3_600_000;
  if (hours < 0) return 0;
  if (hours <= 24) return 40;
  if (hours <= 72) return 25;
  if (hours <= 24 * 5) return 12;
  if (hours <= 24 * 14) return 4;
  return 0;
}

/** Normalizes matchResumeScored's unbounded raw score to a 0-100 "match
 * percent" for the 50%-threshold quality gate (raw score of ~200 — several
 * solid keyword matches plus a title bonus — maps to 100%). */
function matchPercent(rawScore: number): number {
  return Math.min(100, Math.round((rawScore / 200) * 100));
}

function isStale(postedAt: Date | null): boolean {
  if (!postedAt) return false; // unknown age — don't penalize missing data
  const days = (Date.now() - postedAt.getTime()) / 86_400_000;
  return days > FRESHNESS_DAYS;
}

function meetsIndiaSalaryBar(salaryMin: number | null, salaryMax: number | null, currency: string): boolean {
  const value = salaryMax ?? salaryMin;
  if (value == null) return false; // can't verify the bar — exclude rather than guess
  const floor = currency === "INR" ? INDIA_SALARY_FLOOR_INR : INDIA_SALARY_FLOOR_USD;
  return value >= floor;
}

export async function getEligibleJobs(
  requestedNames: string[],
  limit?: number
): Promise<{
  fillable: EligibleJob[];
  manualApplyNeeded: EligibleJob[];
  stats: {
    scanned: number;
    skippedApplied: number;
    skippedNoMatch: number;
    excludedByFilter: number;
    usCount: number;
    indiaCount: number;
  };
}> {
  const profile = loadProfile();
  const target = limit ?? DAILY_TARGET;

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
  const usSupported: EligibleJob[] = [];
  const usUnsupported: EligibleJob[] = [];
  const indiaSupported: EligibleJob[] = [];
  const indiaUnsupported: EligibleJob[] = [];

  let skippedApplied = 0;
  let skippedNoMatch = 0;
  let excludedByFilter = 0;

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

    const country = job.countryCode ?? "UNKNOWN";
    const qualifiesUS = country === "US" && matchPercent(match.score) >= MATCH_PERCENT_THRESHOLD && !isStale(job.postedAt);
    const qualifiesIndia = country === "IN" && meetsIndiaSalaryBar(job.salaryMin, job.salaryMax, job.salaryCurrency);

    if (!qualifiesUS && !qualifiesIndia) {
      excludedByFilter++;
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
      atsType: job.company.atsType,
      title: job.title,
      description: job.description,
      url: job.url,
      location: job.location,
      country,
      dedupeId: dedupeIdFromUrl(job.url),
      resumeCategory: match.resume.category,
      resumePdfPath: match.resume.pdfPath,
      priorityScore: score,
      postedAt: job.postedAt?.toISOString() ?? null,
    };

    const supported = SUPPORTED_ATS.has(job.company.atsType);
    if (qualifiesUS) (supported ? usSupported : usUnsupported).push(entry);
    else (supported ? indiaSupported : indiaUnsupported).push(entry);
  }

  const byScoreDesc = (a: EligibleJob, b: EligibleJob) => b.priorityScore - a.priorityScore;
  usSupported.sort(byScoreDesc);
  usUnsupported.sort(byScoreDesc);
  indiaSupported.sort(byScoreDesc);
  indiaUnsupported.sort(byScoreDesc);

  const usFillable = usSupported.slice(0, target);
  const indiaFillable = usFillable.length < target ? indiaSupported.slice(0, target - usFillable.length) : [];

  const fillable = [...usFillable, ...indiaFillable];
  const manualApplyNeeded = [...usUnsupported, ...indiaUnsupported];

  return {
    fillable,
    manualApplyNeeded,
    stats: {
      scanned: jobs.length,
      skippedApplied,
      skippedNoMatch,
      excludedByFilter,
      usCount: usFillable.length,
      indiaCount: indiaFillable.length,
    },
  };
}
