import { readFileSync } from "fs";
import { join } from "path";

export type ResumeConfig = {
  category: string;
  label: string;
  pdfPath: string;
  keywords: string[];
};

export function loadResumeConfigs(): ResumeConfig[] {
  return JSON.parse(readFileSync(join(process.cwd(), "config/resumes.json"), "utf-8"));
}

/**
 * Scores each resume category against a job title + description. A keyword only
 * counts as a match on a word boundary. Longer, more specific keywords score
 * higher than short generic ones. Returns null when nothing matches at all —
 * by design there is no fallback resume; an unmatched job is skipped entirely.
 */
// Seniority levels well above a 2-year-experience resume — exclude regardless of keyword match.
const SENIORITY_EXCLUSIONS = [
  /\bdirector\b/i,
  /\bvp\b/i,
  /\bvice president\b/i,
  /\bhead of\b/i,
  /\bchief\b/i,
  /\bpresident\b/i,
  /\bprincipal\b/i,
  /\bdistinguished\b/i,
];

/** Same matching logic as matchResume, but also returns the numeric score so
 * callers (eligible-jobs.ts) can rank jobs by match strength, not just filter. */
export function matchResumeScored(
  jobTitle: string,
  jobDescription: string = "",
  resumes: ResumeConfig[] = loadResumeConfigs()
): { resume: ResumeConfig; score: number } | null {
  if (SENIORITY_EXCLUSIONS.some((re) => re.test(jobTitle))) return null;

  const haystack = `${jobTitle} ${jobDescription}`.toLowerCase();

  let best: { resume: ResumeConfig; score: number } | null = null;

  for (const resume of resumes) {
    let score = 0;
    for (const keyword of resume.keywords) {
      const kw = keyword.toLowerCase();
      const pattern = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (pattern.test(haystack)) {
        // weight by keyword specificity (word count + length)
        score += kw.split(/\s+/).length * 10 + kw.length;
        // title matches count extra since they're the strongest signal
        if (new RegExp(pattern).test(jobTitle.toLowerCase())) score += 50;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { resume, score };
    }
  }

  return best;
}

export function matchResume(
  jobTitle: string,
  jobDescription: string = "",
  resumes: ResumeConfig[] = loadResumeConfigs()
): ResumeConfig | null {
  return matchResumeScored(jobTitle, jobDescription, resumes)?.resume ?? null;
}
